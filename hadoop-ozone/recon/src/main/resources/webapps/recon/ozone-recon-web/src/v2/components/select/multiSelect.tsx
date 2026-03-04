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

import Search from '@/v2/components/search/search';
import { selectStyles } from "@/v2/constants/select.constants";


// ------------- Types -------------- //
export type Option = {
  label: string;
  value: string;
}

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

// ------------- Internal Context -------------- //

interface MultiSelectCtxValue {
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  showSearch: boolean;
  showSelectAll: boolean;
  selected: Option[];
  selectableOptions: Option[];
  onChange: (arg0: ValueType<Option, true>) => void;
  searchWrapperRef: React.RefObject<HTMLDivElement>;
  searchInteracting: React.MutableRefObject<boolean>;
  containerRef: React.RefObject<HTMLDivElement>;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const MultiSelectCtx = React.createContext<MultiSelectCtxValue | null>(null);

// ------------- Sub-components -------------- //

const Option: React.FC<OptionProps<Option, true>> = (props) => {
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

// Intercepts react-select v3's onInputBlur, which steals focus back to its
// hidden input whenever a child element gains focus.  While the user is
// interacting with the search box we suppress that call so the dropdown
// stays open.
const CustomInput: React.FC<any> = ({ onBlur, ...inputProps }) => {
  const ctx = React.useContext(MultiSelectCtx);
  const handleBlur = (e: React.FocusEvent) => {
    if (ctx?.searchInteracting.current) return;
    if (onBlur) onBlur(e);
  };
  return <components.Input {...inputProps} onBlur={handleBlur} />;
};

const CustomMenuList: React.FC<any> = ({ children, ...menuListProps }) => {
  const ctx = React.useContext(MultiSelectCtx);
  if (!ctx) return <components.MenuList {...menuListProps}>{children}</components.MenuList>;

  const {
    searchTerm,
    setSearchTerm,
    showSearch,
    showSelectAll,
    selected,
    selectableOptions,
    onChange,
    searchWrapperRef,
    searchInteracting,
    containerRef,
    setIsMenuOpen
  } = ctx;

  const allSelected = selectableOptions.length > 0
    && selected.length === selectableOptions.length;

  return (
    <components.MenuList {...menuListProps}>
      {showSearch && (
        <div
          ref={searchWrapperRef}
          style={{
            padding: '8px 12px',
            borderBottom: '1px solid #E6E6E6',
            backgroundColor: '#FFFFFF'
          }}
          // e.preventDefault() keeps focus on the react-select hidden input
          // during the mousedown phase so onInputBlur does not fire yet.
          onMouseDown={(e) => {
            searchInteracting.current = true;
            e.preventDefault();
          }}
          // After the full click cycle, manually focus the Ant Design input.
          // CustomInput suppresses the resulting blur callback so the menu
          // stays open.
          onClick={() => {
            const input = searchWrapperRef.current?.querySelector('input');
            if (input) (input as HTMLInputElement).focus();
          }}
          onFocus={() => { searchInteracting.current = true; }}
          onBlur={() => {
            searchInteracting.current = false;
            // If focus has left the entire multiselect widget, close the menu.
            setTimeout(() => {
              if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
                setIsMenuOpen(false);
                setSearchTerm('');
              }
            }, 150);
          }}
          // Let Escape close the dropdown even while the search box is focused.
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              searchInteracting.current = false;
              setIsMenuOpen(false);
              setSearchTerm('');
            }
            e.stopPropagation();
          }}
        >
          <Search
            searchInput={searchTerm}
            onSearchChange={(e) => setSearchTerm(e.target.value)}
            onChange={() => { }}
          />
        </div>
      )}
      {showSelectAll && (
        <div
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            borderBottom: '1px solid #E6E6E6',
            color: '#1AA57A',
            fontWeight: 500,
            fontSize: '14px',
            userSelect: 'none'
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(allSelected ? [] : selectableOptions);
          }}
        >
          {allSelected ? 'Unselect All' : 'Select All'}
        </div>
      )}
      {children}
    </components.MenuList>
  );
};

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
  // keep the dropdown open while the user interacts with the Search box.
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  // True while the user's pointer/keyboard focus is inside the search wrapper.
  const searchInteracting = React.useRef(false);
  // Ref to the search wrapper div (used in onClick to focus the inner <input>).
  const searchWrapperRef = React.useRef<HTMLDivElement>(null);
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

  const ctxValue: MultiSelectCtxValue = {
    searchTerm,
    setSearchTerm,
    showSearch,
    showSelectAll,
    selected,
    selectableOptions,
    onChange,
    searchWrapperRef,
    searchInteracting,
    containerRef,
    setIsMenuOpen
  };

  const select = (
    <ReactSelect
      {...props}
      {...searchModeProps}
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
        Option,
        MenuList: CustomMenuList,
        // Override Input only when search is enabled so we can suppress the
        // blur-driven close while the user types in the Search box.
        ...(showSearch ? { Input: CustomInput } : {})
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

  // Wrap in a context provider so CustomMenuList and CustomInput can access
  // internal state without prop drilling through react-select.
  // Also wrap in a div when showSearch is active so we have a container
  // boundary for detecting "focus left the widget" in the search onBlur.
  return (
    <MultiSelectCtx.Provider value={ctxValue}>
      {showSearch
        ? <div ref={containerRef} style={{ display: 'contents' }}>{select}</div>
        : select}
    </MultiSelectCtx.Provider>
  );
}

export default MultiSelect;
