import PropTypes from 'prop-types';

/** Prop shape of one team from GET /me/teams, shared by the table and the panel. */
const progressShape = PropTypes.shape({ completed: PropTypes.number, total: PropTypes.number, percent: PropTypes.number });

export const myTeamShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  code: PropTypes.string,
  name: PropTypes.string.isRequired,
  manager_name: PropTypes.string,
  manager_email: PropTypes.string,
  members: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number, name: PropTypes.string, job_title: PropTypes.string, is_me: PropTypes.bool, progress: progressShape })).isRequired,
  projects: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number,
      code: PropTypes.string,
      name: PropTypes.string,
      department: PropTypes.string,
      health: PropTypes.string,
      end_date: PropTypes.string,
      milestone: PropTypes.shape({ sequence: PropTypes.number, name: PropTypes.string, status: PropTypes.string, locked: PropTypes.bool, projected_end_date: PropTypes.string, progress: progressShape }),
      my_progress: progressShape,
      my_hours: PropTypes.number,
      my_planned_hours: PropTypes.number,
      is_active: PropTypes.bool,
    }),
  ).isRequired,
});
