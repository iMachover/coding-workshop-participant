import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import MailOutlined from '@mui/icons-material/MailOutlined';
import { HEALTH, MILESTONE_STATUS } from '../../config/statuses';
import { Meter } from '../../components/Meter';
import { PersonCell } from '../../components/PersonCell';
import { SidePanel } from '../../components/SidePanel';
import { StatusChip } from '../../components/StatusChip';
import { monoFont } from '../../theme';
import { formatDay, formatHours } from '../../utils/format';
import { myTeamShape } from './shapes';

/**
 * Employee's team panel (`?team=<id>` on My teams): the manager, each project with its
 * current milestone, the team's and the employee's own progress, and who is on the team with
 * their progress. Teammates' hours, costs and account details are never shown.
 *
 * @param {{ team: object|null, hasActive: boolean, onClose: () => void, onOpenProject: (id: number) => void }} props
 */
export function TeamDetailPanel({ team, hasActive, onClose, onOpenProject }) {
  return (
    <SidePanel open={team !== null} title={team ? `${team.code} · ${team.name}` : 'Team'} onClose={onClose}>
      {team && (
        <>
          <Section title="Manager">
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <PersonCell name={team.manager_name} sub={team.manager_email} />
              <Button size="small" startIcon={<MailOutlined />} href={`mailto:${team.manager_email}`}>
                Contact
              </Button>
            </Box>
          </Section>

          <Section title={team.projects.length === 1 ? 'Project' : 'Projects'} count={team.projects.length}>
            {team.projects.length === 0 && (
              <Typography color="text.secondary" sx={{ fontSize: 11 }}>
                This team is not on a project yet, so it has no milestone to work through.
              </Typography>
            )}
            {team.projects.map((p, index) => (
              <Box key={p.id} sx={{ pt: index ? 2 : 0, mt: index ? 2 : 0, borderTop: index ? 1 : 0, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e' }}>{p.code}</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 650 }}>{p.name}</Typography>
                  <StatusChip status={p.health} map={HEALTH} />
                </Box>
                <Typography color="text.secondary" sx={{ fontSize: 10, mt: 0.375 }}>
                  {p.department} · target {formatDay(p.end_date)}
                </Typography>
                {p.milestone ? (
                  <Box sx={{ mt: 1.5, display: 'grid', gap: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: 12 }}>
                        {String(p.milestone.sequence).padStart(2, '0')} · {p.milestone.name}
                      </Typography>
                      <StatusChip status={p.milestone.locked ? 'locked' : p.milestone.status} map={MILESTONE_STATUS} />
                      {p.is_active && <StatusChip status="current" map={{ current: { label: 'Your current milestone', tone: 'info' } }} />}
                    </Box>
                    <Meter percent={p.milestone.progress.percent} label="Team milestone progress" valueLabel={`${p.milestone.progress.completed} / ${p.milestone.progress.total} tasks · ${p.milestone.progress.percent}%`} />
                    <Meter percent={p.my_progress.percent} label="Your milestone progress" valueLabel={`${p.my_progress.completed} / ${p.my_progress.total} of your tasks · ${p.my_progress.percent}%`} />
                    <Typography color="text.secondary" sx={{ fontSize: 10 }}>
                      {formatHours(p.my_hours)} of {formatHours(p.my_planned_hours)} logged · due {formatDay(p.milestone.projected_end_date)}
                    </Typography>
                  </Box>
                ) : (
                  <Typography color="text.secondary" sx={{ fontSize: 11, mt: 1 }}>
                    Every milestone on this project is approved.
                  </Typography>
                )}
                {!p.is_active && hasActive && p.milestone && (
                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#eff3e5', color: '#4c6954', borderRadius: '5px', fontSize: 11 }}>
                    Your next milestone here will not activate until your current milestone is complete. Membership in a second team does not create a second active milestone.
                  </Box>
                )}
                <Button size="small" endIcon={<ArrowForwardOutlined />} onClick={() => onOpenProject(p.id)} sx={{ mt: 1.25, px: 0 }}>
                  Open project
                </Button>
              </Box>
            ))}
          </Section>

          <Section title="People on this team" count={team.members.length}>
            {team.members.map((m) => (
              <Box key={m.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, py: 0.875 }}>
                <PersonCell name={m.is_me ? `${m.name} (you)` : m.name} sub={m.job_title ?? undefined} />
                <Typography sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>{m.progress.percent}% progress</Typography>
              </Box>
            ))}
            <Typography color="text.secondary" sx={{ fontSize: 10, mt: 1 }}>
              Team progress is shown for coordination. Other people's hours, costs and account details are not.
            </Typography>
          </Section>
        </>
      )}
    </SidePanel>
  );
}

function Section({ title, count, children }) {
  return (
    <Box component="section" aria-label={title} sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
        <Typography variant="h3">{title}</Typography>
        {count !== undefined && (
          <Box component="span" sx={{ px: 0.75, py: 0.25, borderRadius: 0.8, bgcolor: '#e6eddf', color: '#4d6c50', fontSize: 10 }}>
            {count}
          </Box>
        )}
      </Box>
      {children}
    </Box>
  );
}

Section.propTypes = { title: PropTypes.string.isRequired, count: PropTypes.number, children: PropTypes.node.isRequired };

TeamDetailPanel.propTypes = {
  team: myTeamShape,
  hasActive: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onOpenProject: PropTypes.func.isRequired,
};
