import PropTypes from 'prop-types';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { initialsOf } from '../utils/format';

/**
 * Initials avatar with a name and an optional second line, e.g. an email or team
 * (prototype `Person`).
 *
 * @param {{ name: string, sub?: string }} props
 */
export function PersonCell({ name, sub }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Avatar aria-hidden="true">{initialsOf(name)}</Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 12 }} noWrap>
          {name}
        </Typography>
        {sub && (
          <Typography color="text.secondary" sx={{ fontSize: 10, mt: 0.375 }} noWrap>
            {sub}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

PersonCell.propTypes = {
  name: PropTypes.string.isRequired,
  sub: PropTypes.string,
};
