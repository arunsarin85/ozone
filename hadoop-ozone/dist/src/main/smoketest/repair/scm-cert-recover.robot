# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

*** Settings ***
Documentation       Test ozone repair scm cert recover against an offline SCM DB checkpoint.
Resource            ../lib/os.robot
Test Timeout        5 minutes
Test Setup          Create SCM DB Checkpoint
Test Teardown       Remove Directory    ${TEST_DIR}    recursive=True

*** Variables ***
${SCM_DB}           /data/metadata/scm.db

*** Keywords ***
Create SCM DB Checkpoint
    ${test_dir} =    Execute    mktemp -d
    Set Test Variable    ${TEST_DIR}    ${test_dir}
    Set Test Variable    ${DB}    ${test_dir}/scm.db
    Execute    ozone debug ldb --db=${SCM_DB} checkpoint --output=${DB}

*** Test Cases ***
Recover SCM Certs Dry Run
    ${output} =    Execute
    ...    ozone repair scm cert recover --db=${DB} --dry-run
    Should Contain    ${output}    [dry run] Writing cert
    Should Contain    ${output}    Sub cert serialID for this host:
    Should Contain    ${output}    Root cert serialID:
