import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import SearchOutlined from '@mui/icons-material/SearchOutlined';

/**
 * Search box plus an optional filter dropdown above a table (prototype `.acme-toolbar`).
 *
 * @param {{ search: string, onSearch: (value: string) => void, placeholder?: string,
 *           filter?: string, onFilter?: (value: string) => void,
 *           filterLabel?: string, filterOptions?: { value: string, label: string }[] }} props
 */
export function TableToolbar({
  search,
  onSearch,
  placeholder = 'Search…',
  filter,
  onFilter,
  filterLabel = 'Filter',
  filterOptions,
}) {
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
      {filterOptions && (
        <TextField
          select
          size="small"
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': filterLabel } }}
          sx={{ minWidth: 120 }}
        >
          {filterOptions.map(({ value, label }) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Box>
  );
}

TableToolbar.propTypes = {
  search: PropTypes.string.isRequired,
  onSearch: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  filter: PropTypes.string,
  onFilter: PropTypes.func,
  filterLabel: PropTypes.string,
  filterOptions: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })),
};
