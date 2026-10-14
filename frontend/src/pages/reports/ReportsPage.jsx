import PropTypes from 'prop-types';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import PaidOutlined from '@mui/icons-material/PaidOutlined';
import { useAuth } from '../../context/useAuth';
import { useApiGet } from '../../hooks/useApiGet';
import { usePanelParams } from '../../hooks/usePanelParams';
import { HEALTH } from '../../config/statuses';
import { EmptyState } from '../../components/EmptyState';
import { FigureRow } from '../../components/FigureRow';
import { LoadState } from '../../components/LoadState';
import { Meter } from '../../components/Meter';
import { SectionCard } from '../../components/SectionCard';
import { StatCards } from '../../components/StatCards';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../layout/PageHeader';
import { monoFont } from '../../theme';
import { formatCount, formatDay, formatHours, formatMoney } from '../../utils/format';

/**
 * Reports (MANAGER.md §6.4, prototype `RolePage page="Reports"`): totals across the manager's
 * projects, hours by project, the weekly labour cost of the last five weeks, over-allocated
 * people and the planning note. Data: GET /manager/reports. Export CSV downloads the project rows.
 */
export function ReportsPage() {
  const { user } = useAuth();
  const { open } = usePanelParams();
  const { data, error, retry } = useApiGet('/manager/reports');

  function exportCsv() {
    const rows = [
      ['Project', 'Name', 'Health', 'Actual hours', 'Planned hours', 'Actual cost (USD)', 'Planned cost (USD)', 'Budget (USD)', 'Delivery %'],
      ...data.projects.map((p) => [p.code, p.name, p.health, p.actual_hours, p.planned_hours, p.actual_cost, p.planned_cost, p.budget, p.progress.percent]),
      [],
      ['Week starting', 'Hours', 'Labour cost (USD)'],
      ...data.weekly_cost.map((w) => [w.week_start, w.hours, w.cost]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reports-${data.week.start}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        eyebrow={`Manager workspace · ${user.first_name} ${user.last_name}`}
        title="Reports"
        subtitle="Hours and cost across the projects you manage, week by week."
        actions={
          <Button startIcon={<DownloadOutlined />} onClick={exportCsv} disabled={!data?.projects.length}>
            Export CSV
          </Button>
        }
      />
      {!data && <LoadState error={error} onRetry={retry} />}
      {data && (
        <>
          <StatCards
            items={[
              { label: 'Actual project cost', value: formatMoney(data.totals.actual_cost), detail: `Across ${data.totals.projects} active ${data.totals.projects === 1 ? 'project' : 'projects'}`, icon: PaidOutlined },
              { label: 'Total budget', value: formatMoney(data.totals.budget), detail: `${data.totals.budget_used_percent}% used · ${formatMoney(data.totals.budget_remaining)} remaining`, icon: PaidOutlined },
              { label: 'Hours', value: `${formatHours(data.totals.actual_hours)}`, detail: `of ${formatHours(data.totals.planned_hours)} planned · ${formatHours(data.totals.hours_remaining)} remaining`, icon: AccessTimeOutlined },
              { label: 'Over-allocated people', value: formatCount(data.over_allocated.length), detail: data.over_allocated.length ? data.over_allocated.map((p) => `${p.name} · ${formatHours(p.hours_this_week)} / ${formatHours(data.week.capacity_hours)}`).join(', ') : `Nobody above ${formatHours(data.week.capacity_hours)} this week`, icon: GroupOutlined },
            ]}
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 324px' }, gap: { xs: 2, lg: 2.5 }, alignItems: 'start' }}>
            <Box sx={{ display: 'grid', gap: { xs: 2, lg: 2.5 }, minWidth: 0 }}>
              <SectionCard title="Hours by project" subtitle="Actual against planned, for the projects you manage. Select a project to open it.">
                {data.projects.length === 0 ? (
                  <EmptyState text="No active projects. An admin assigns projects to managers." />
                ) : (
                  data.projects.map((p, index) => (
                    <Box
                      key={p.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open project ${p.name}`}
                      onClick={() => open('selected', p.id)}
                      onKeyDown={(event) => event.key === 'Enter' && open('selected', p.id)}
                      sx={{ px: 2.25, py: 2, borderTop: index ? 1 : 0, borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: '#f0f4e9' } }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                          <Typography sx={{ fontFamily: monoFont, fontSize: 10, color: '#7a8c7e' }}>{p.code}</Typography>
                          <Typography sx={{ fontSize: 12, fontWeight: 650 }}>{p.name}</Typography>
                          <StatusChip status={p.health} map={HEALTH} />
                        </Box>
                        <Typography sx={{ fontFamily: monoFont, fontSize: 11, whiteSpace: 'nowrap' }}>
                          {formatHours(p.actual_hours)} / {formatHours(p.planned_hours)}
                        </Typography>
                      </Box>
                      <Meter percent={p.hours_used_percent} warn={p.health === 'at_risk' || p.hours_used_percent > 100} />
                      <Typography color="text.secondary" component="p" sx={{ fontSize: 10, mt: 1 }}>
                        {formatMoney(p.actual_cost)} actual / {formatMoney(p.planned_cost)} planned · {formatMoney(p.budget)} budget · {p.progress.percent}% delivery complete
                      </Typography>
                    </Box>
                  ))
                )}
              </SectionCard>

              <SectionCard title="Weekly resource cost" subtitle={`Labour logged on your projects, hours × rate, for the last ${data.weekly_cost.length} weeks.`}>
                <WeeklyCostChart series={data.weekly_cost} />
              </SectionCard>
            </Box>

            <SectionCard title="Planning note" subtitle={data.attention ? `${data.attention.code} · ${data.attention.name}` : 'Nothing needs attention'}>
              {data.attention ? (
                <>
                  <Box sx={{ px: 2, pt: 2, pb: 1 }}>
                    <StatusChip status={data.attention.health} map={HEALTH} />
                    <Typography sx={{ fontSize: 12, mt: 1.5 }}>
                      {data.attention.name} has used {data.attention.budget_used_percent}% of its budget at {data.attention.delivery_percent}% delivery.
                      {data.attention.budget_used_percent > data.attention.delivery_percent
                        ? ' Review the remaining work before adding new assignments.'
                        : ' Cost is tracking at or behind delivery.'}
                    </Typography>
                  </Box>
                  <Divider />
                  <FigureRow label="Budget remaining" value={formatMoney(data.attention.budget_remaining)} />
                  <Divider />
                  <FigureRow label="Hours remaining" value={formatHours(data.attention.hours_remaining)} />
                  <Divider />
                  <Box sx={{ px: 2, py: 1.5 }}>
                    <Button size="small" component={RouterLink} to={`/projects?selected=${data.attention.id}`} endIcon={<ArrowForwardOutlined />}>
                      Review projects
                    </Button>
                  </Box>
                </>
              ) : (
                <EmptyState text="Figures appear once you manage a project with tasks." />
              )}
            </SectionCard>
          </Box>
        </>
      )}
    </>
  );
}

/** Five bars, one per week, labelled with the cost and the week's Monday. */
function WeeklyCostChart({ series }) {
  const max = Math.max(...series.map((w) => w.cost), 1);
  return (
    <Box
      role="img"
      aria-label={`Weekly labour cost: ${series.map((w) => `week of ${formatDay(w.week_start)} ${formatMoney(w.cost)}`).join(', ')}`}
      sx={{ display: 'grid', gridTemplateColumns: `repeat(${series.length}, 1fr)`, alignItems: 'end', gap: { xs: 1, md: 2 }, px: 2.25, pt: 3, pb: 2, height: 220 }}
    >
      {series.map((w) => (
        <Box key={w.week_start} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', minWidth: 0 }}>
          <Typography sx={{ fontFamily: monoFont, fontSize: 10, mb: 0.5, whiteSpace: 'nowrap' }}>{formatMoney(w.cost)}</Typography>
          <Box sx={{ width: '100%', maxWidth: 56, height: `${Math.max((w.cost / max) * 140, w.cost ? 4 : 2)}px`, bgcolor: w.cost ? '#508271' : '#e6ece3', borderRadius: '4px 4px 0 0' }} />
          <Typography color="text.secondary" sx={{ fontSize: 10, mt: 0.75, whiteSpace: 'nowrap' }}>{formatDay(w.week_start)}</Typography>
          <Typography color="text.secondary" sx={{ fontSize: 9, whiteSpace: 'nowrap' }}>{formatHours(w.hours)}</Typography>
        </Box>
      ))}
    </Box>
  );
}

WeeklyCostChart.propTypes = {
  series: PropTypes.arrayOf(PropTypes.shape({ week_start: PropTypes.string.isRequired, hours: PropTypes.number, cost: PropTypes.number.isRequired })).isRequired,
};
