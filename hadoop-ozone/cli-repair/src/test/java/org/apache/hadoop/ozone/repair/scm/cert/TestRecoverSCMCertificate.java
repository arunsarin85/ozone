/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.apache.hadoop.ozone.repair.scm.cert;

import static org.apache.hadoop.hdds.HddsConfigKeys.OZONE_METADATA_DIRS;
import static org.apache.hadoop.hdds.protocol.proto.HddsProtos.NodeType.SCM;
import static org.apache.hadoop.hdds.scm.ScmConfigKeys.OZONE_SCM_DB_DIRS;
import static org.apache.ozone.test.IntLambda.withTextFromSystemIn;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.math.BigInteger;
import java.net.InetAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.List;
import java.util.stream.Stream;
import org.apache.hadoop.hdds.conf.OzoneConfiguration;
import org.apache.hadoop.hdds.scm.ha.SCMRatisServer;
import org.apache.hadoop.hdds.scm.ha.invoker.ScmInvoker;
import org.apache.hadoop.hdds.scm.metadata.SCMMetadataStoreImpl;
import org.apache.hadoop.hdds.scm.server.SCMCertStore;
import org.apache.hadoop.hdds.security.SecurityConfig;
import org.apache.hadoop.hdds.security.x509.CertificateTestUtils;
import org.apache.hadoop.hdds.security.x509.certificate.authority.CertificateStore;
import org.apache.hadoop.hdds.security.x509.certificate.client.SCMCertificateClient;
import org.apache.hadoop.hdds.utils.IOUtils;
import org.apache.hadoop.hdds.utils.db.CodecBuffer;
import org.apache.hadoop.ozone.OzoneConsts;
import org.apache.hadoop.ozone.repair.OzoneRepair;
import org.apache.ozone.test.GenericTestUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import picocli.CommandLine;

/**
 * Tests for {@link RecoverSCMCertificate}.
 */
public class TestRecoverSCMCertificate {

  private static final BigInteger SUB_CERT_ID = BigInteger.valueOf(11);
  private static final BigInteger ROOT_CERT_ID = BigInteger.valueOf(22);

  @TempDir
  private Path tempDir;

  private Path metadataDir;
  private Path scmDbPath;
  private OzoneConfiguration conf;
  private SCMMetadataStoreImpl metadataStore;
  private KeyPair keyPair;
  private String hostname;
  private GenericTestUtils.PrintStreamCapturer out;
  private GenericTestUtils.PrintStreamCapturer err;

  @BeforeEach
  public void setUp() throws Exception {
    CodecBuffer.enableLeakDetection();
    out = GenericTestUtils.captureOut();
    err = GenericTestUtils.captureErr();

    hostname = InetAddress.getLocalHost().getHostName();
    KeyPairGenerator keyPairGenerator = KeyPairGenerator.getInstance("RSA");
    keyPairGenerator.initialize(2048);
    keyPair = keyPairGenerator.generateKeyPair();

    metadataDir = tempDir.resolve("metadata");
    Path scmDbDir = metadataDir.resolve("scm-db");
    Files.createDirectories(scmDbDir);

    conf = new OzoneConfiguration();
    conf.set(OZONE_METADATA_DIRS, metadataDir.toString());
    conf.set(OZONE_SCM_DB_DIRS, scmDbDir.toString());

    scmDbPath = scmDbDir.resolve(OzoneConsts.SCM_DB_NAME);

    populateScmCertsInDb();
    metadataStore.stop();
    metadataStore = null;

    deleteScmCertFiles();
  }

  @AfterEach
  public void tearDown() throws Exception {
    if (metadataStore != null) {
      metadataStore.stop();
    }
    CodecBuffer.assertNoLeaks();
    IOUtils.closeQuietly(out, err);
  }

  @Test
  public void testRecoverScmCertsDryRunDoesNotWriteFiles() throws Exception {
    int exitCode = runRecover(true);

    assertThat(exitCode).isEqualTo(CommandLine.ExitCode.OK);
    assertThat(out.getOutput())
        .contains("[dry run] Writing cert")
        .contains("Sub cert serialID for this host: " + SUB_CERT_ID)
        .contains("Root cert serialID: " + ROOT_CERT_ID);
    assertThat(listScmCertFiles()).isEmpty();
  }

  @Test
  public void testRecoverScmCertsRestoresDeletedCertFiles() throws Exception {
    int exitCode = withTextFromSystemIn("y")
        .execute(() -> runRecover(false));

    assertThat(exitCode).isEqualTo(CommandLine.ExitCode.OK);
    assertThat(out.getOutput())
        .contains("Writing cert")
        .doesNotContain("[dry run] Writing cert");

    SecurityConfig securityConfig = new SecurityConfig(conf);
    Path certDir = securityConfig.getCertificateLocation(SCMCertificateClient.COMPONENT_NAME);
    assertThat(Files.isDirectory(certDir)).isTrue();
    assertThat(listScmCertFiles())
        .anyMatch(name -> name.equals(SUB_CERT_ID + ".crt"))
        .anyMatch(name -> name.startsWith("CA-") && name.endsWith(".crt"));
    assertThat(Files.exists(certDir.resolve(securityConfig.getCertificateFileName()))).isTrue();
  }

  @Test
  public void testRecoverScmCertsFailsForInvalidDbPath() throws Exception {
    CommandLine cli = new OzoneRepair().getCmd();
    int exitCode = cli.execute(
        "-D", OZONE_METADATA_DIRS + "=" + metadataDir,
        "scm", "cert", "recover", "--db", tempDir.resolve("missing").toString(), "--dry-run");

    assertThat(exitCode).isNotEqualTo(CommandLine.ExitCode.OK);
    assertThat(err.getOutput()).contains("Error: Incorrect DB Path");
  }

  private int runRecover(boolean dryRun) {
    CommandLine cli = new OzoneRepair().getCmd();
    if (dryRun) {
      return cli.execute(
          "-D", OZONE_METADATA_DIRS + "=" + metadataDir,
          "scm", "cert", "recover", "--db", scmDbPath.toString(), "--dry-run");
    }
    return cli.execute(
        "-D", OZONE_METADATA_DIRS + "=" + metadataDir,
        "scm", "cert", "recover", "--db", scmDbPath.toString());
  }

  private void populateScmCertsInDb() throws Exception {
    final SCMRatisServer ratisServer = mock(SCMRatisServer.class);
    when(ratisServer.getProxyHandler(any(ScmInvoker.class)))
        .thenAnswer(invocation -> {
          ScmInvoker<?> invoker = invocation.getArgument(0);
          return invoker.getImpl();
        });

    metadataStore = new SCMMetadataStoreImpl(conf);
    CertificateStore scmCertStore = new SCMCertStore.Builder()
        .setRatisServer(ratisServer)
        .setMetadaStore(metadataStore)
        .build();

    X509Certificate subCert = CertificateTestUtils.createSelfSignedCert(
        keyPair, OzoneConsts.SCM_SUB_CA_PREFIX + hostname, Duration.ofDays(1), SUB_CERT_ID);
    X509Certificate rootCert = CertificateTestUtils.createSelfSignedCert(
        keyPair, OzoneConsts.SCM_ROOT_CA_PREFIX + "rootca", Duration.ofDays(1), ROOT_CERT_ID);

    scmCertStore.storeValidCertificate(subCert.getSerialNumber(), subCert, SCM);
    scmCertStore.storeValidCertificate(rootCert.getSerialNumber(), rootCert, SCM);
  }

  private void deleteScmCertFiles() throws IOException {
    SecurityConfig securityConfig = new SecurityConfig(conf);
    Path certDir = securityConfig.getCertificateLocation(SCMCertificateClient.COMPONENT_NAME);
    if (Files.isDirectory(certDir)) {
      try (Stream<Path> paths = Files.list(certDir)) {
        paths.filter(path -> path.getFileName().toString().endsWith(".crt"))
            .forEach(path -> {
              try {
                Files.deleteIfExists(path);
              } catch (IOException e) {
                throw new RuntimeException(e);
              }
            });
      }
    }
    assertThat(listScmCertFiles()).isEmpty();
  }

  private List<String> listScmCertFiles() throws IOException {
    SecurityConfig securityConfig = new SecurityConfig(conf);
    Path certDir = securityConfig.getCertificateLocation(SCMCertificateClient.COMPONENT_NAME);
    if (!Files.isDirectory(certDir)) {
      return List.of();
    }
    try (Stream<Path> paths = Files.list(certDir)) {
      return paths
          .map(path -> path.getFileName().toString())
          .filter(name -> name.endsWith(".crt"))
          .sorted()
          .toList();
    }
  }
}
