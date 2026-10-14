import PropTypes from 'prop-types';
import { useId } from 'react';
import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

/**
 * Search box plus optional filter dropdowns above a table (prototype `.acme-toolbar`).
 * One filter is passed as `filter` / `onFilter` / `filterOptions`; more go in `filters`.
 *
 * @param {{ search: string, onSearch: (value: string) => void, placeholder?: string,
 *           filter?: string, onFilter?: (value: string) => void,
 *           filterLabel?: string, filterOptions?: { value: string, label: string }[],
 *           filters?: { value: string, onChange: (value: string) => void, label: string,
 *                       options: { value: string, label: string }[] }[] }} props
 */
export function SearchBar({
  search,
  onSearch,
  placeholder = 'Search…',
  filter,
  onFilter,
  filterLabel = 'Filter',
  filterOptions,
  filters = [],
}) {
  const all = filterOptions ? [{ value: filter, onChange: onFilter, label: filterLabel, options: filterOptions }, ...filters] : filters;
  return (
    <Box sx={{ display: 'flex', flexWrap: { xs: 'wrap', md: 'nowrap' }, alignItems: 'center', gap: 1.25 }}>
      <TextField
        size="small"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={placeholder}
        slotProps={{
          htmlInput: { 'aria-label': placeholder },
          input: {
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0 }}>
                <SearchOutlined sx={{ fontSize: 14, color: 'text.secondary' }} />
              </InputAdornment>
            ),
          },
        }}
        sx={{ width: { xs: 160, sm: 190 } }}
      />
      {all.map((f) => (
        <FilterSelect key={f.label} {...f} />
      ))}
    </Box>
  );
}

/**
 * One filter dropdown. MUI's Select labels its combobox by its own id, so the accessible
 * name would be the chosen value; a hidden label element puts `label` in front of it
 * ("Filter by state, All teams").
 */
function FilterSelect({ value, onChange, label, options }) {
  const labelId = useId();
  return (
    <>
      <Box component="span" id={labelId} sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
        {label}
      </Box>
      <TextField
        select
        size="small"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{ select: { labelId } }}
        sx={{ minWidth: 120 }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    </>
  );
}

const optionShape = PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string }));

SearchBar.propTypes = {
  search: PropTypes.string.isRequired,
  onSearch: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  filter: PropTypes.string,
  onFilter: PropTypes.func,
  filterLabel: PropTypes.string,
  filterOptions: optionShape,
  filters: PropTypes.arrayOf(
    PropTypes.shape({ value: PropTypes.string, onChange: PropTypes.func, label: PropTypes.string, options: optionShape }),
  ),
};

FilterSelect.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  options: optionShape.isRequired,
};
