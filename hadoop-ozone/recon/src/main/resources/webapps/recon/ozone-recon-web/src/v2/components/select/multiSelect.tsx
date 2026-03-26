/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from "react";
import {
  default as ReactSelect,
  Props as ReactSelectProps,
  components,
  OptionProps,
  ValueType,
  ValueContainerProps,
  StylesConfig
} from 'react-select';

import { selectStyles } from "@/v2/constants/select.constants";
import MultiSelectMenuList, { MultiSelectInput, Option } from './multiSelectMenuList';

export type { Option };

// ------------- Types -------------- //

interface MultiSelectProps extends ReactSelectProps<Option, true> {
  options: Option[];
  selected: Option[];
  placeholder: string;
  fixedColumn: string;
  columnLength: number;
  style?: StylesConfig<Option, true>;
  showSearch?: boolean;
  showSelectAll?: boolean;
  onChange: (arg0: ValueType<Option, true>) => void;
  onTagClose: (arg0: string) => void;
}

// ------------- Sub-components -------------- //

const OptionComponent: React.FC<OptionProps<Option, true>> = (props) => {
  return (
    <div>
      <components.Option
        {...props}>
        <input
          type='checkbox'
          checked={props.isSelected}
          style={{
            marginRight: '8px',
            accentColor: '#1AA57A'
          }}
          onChange={() => null}
          disabled={props.isDisabled} />
        <label>{props.label}</label>
      </components.Option>
    </div>
  )
}

// ------------- Main Component -------------- //

const MultiSelect: React.FC<MultiSelectProps> = ({
  options = [],
  selected = [],
  maxSelected = 5,
  placeholder = 'Columns',
  isDisabled = false,
  fixedColumn,
  columnLength,
  tagRef,
  style,
  showSearch = false,
  showSelectAll = false,
  onTagClose = () => { },
  onChange = () => { },
  ...props
}) => {

  const [searchTerm, setSearchTerm] = React.useState('');
  // Controlled menu-open state — only used when showSearch=true so we can
  // keep the dropdown open while the user interacts with the search box.
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  // True while the user's pointer/keyboard focus is inside the search wrapper.
  const searchInteracting = React.useRef(false);
  // Ref to the outer container div so we can detect "focus left the widget".
  const containerRef = React.useRef<HTMLDivElement>(null);

  const fixedOption = fixedColumn ? options.find((opt) => opt.value === fixedColumn) : undefined;
  const selectableOptions = fixedColumn
    ? options.filter((opt) => opt.value !== fixedColumn)
    : options;

  const filteredOptions = React.useMemo(() => {
    if (!showSearch || !searchTerm) return selectableOptions;
    return selectableOptions.filter(opt =>
      opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [selectableOptions, searchTerm, showSearch]);

  const ValueContainer = ({ children, ...props }: ValueContainerProps<Option, true>) => {
    return (
      <components.ValueContainer {...props}>
        {React.Children.map(children, (child) => (
          ((child as React.ReactElement<any, string
            | React.JSXElementConstructor<any>>
            | React.ReactPortal)?.type as React.JSXElementConstructor<any>)).name === "DummyInput"
          ? child
          : null
        )}
        {isDisabled
          ? placeholder
          : `${placeholder}: ${selected.filter((opt) => opt.value !== fixedColumn).length} selected`
        }
      </components.ValueContainer>
    );
  };

  // Only intercept onMenuClose when showSearch is active; otherwise let
  // react-select manage open/close normally (preserving existing behaviour
  // for all other MultiSelect usages such as the column picker).
  const handleMenuClose = React.useCallback(() => {
    if (!searchInteracting.current) {
      setIsMenuOpen(false);
      setSearchTerm('');
    }
  }, []);

  const finalStyles = {...selectStyles, ...style ?? {}};

  const searchModeProps = showSearch
    ? {
        menuIsOpen: isMenuOpen,
        onMenuOpen: () => setIsMenuOpen(true),
        onMenuClose: handleMenuClose
      }
    : {};

  // Extra props passed through react-select's selectProps mechanism so that
  // MultiSelectMenuList and MultiSelectInput can access internal state without
  // prop-drilling through react-select.
  const extraSelectProps = {
    searchTerm,
    setSearchTerm,
    showSearch,
    showSelectAll,
    selected,
    selectableOptions,
    fixedOptions: fixedOption ? [fixedOption] : [],
    customOnChange: onChange,
    searchInteracting,
    setIsMenuOpen,
    containerRef
  };

  const select = (
    <ReactSelect
      {...props}
      {...searchModeProps}
      {...(extraSelectProps as any)}
      isMulti={true}
      closeMenuOnSelect={false}
      hideSelectedOptions={false}
      isClearable={false}
      isSearchable={false}
      controlShouldRenderValue={false}
      classNamePrefix='multi-select'
      options={filteredOptions}
      components={{
        ValueContainer,
        Option: OptionComponent,
        MenuList: MultiSelectMenuList,
        // Override Input only when search is enabled so we can suppress the
        // blur-driven close while the user types in the search box.
        ...(showSearch ? { Input: MultiSelectInput } : {})
      }}
      menuPortalTarget={document.body}
      placeholder={placeholder}
      value={selected.filter((opt) => opt.value !== fixedColumn)}
      isDisabled={isDisabled}
      onChange={(selected: ValueType<Option, true>) => {
        const selectedOpts = (selected as Option[]) ?? [];
        const withFixed = fixedOption ? [fixedOption, ...selectedOpts] : selectedOpts;
        if (selectedOpts.length === selectableOptions.length) return onChange!(options);
        return onChange!(withFixed);
      }}
      styles={finalStyles} />
  );

  // Wrap in a container div when showSearch is active so MultiSelectMenuList
  // can detect when focus has left the entire widget.
  return showSearch
    ? <div ref={containerRef} style={{ display: 'contents' }}>{select}</div>
    : select;
}

export default MultiSelect;
