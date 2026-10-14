import { usePanelParams } from '../../hooks/usePanelParams';
import { ProjectPanel } from '../projects/ProjectPanel';
import { MilestonePanel } from './MilestonePanel';
import { TaskPanel } from './TaskPanel';

/**
 * The stacked side panels (project → milestone → task), mounted once in the app shell and
 * driven by the URL, so any page can open one with a link like `?task=12`.
 */
export function WorkPanels() {
  const { ids, open, close } = usePanelParams();
  return (
    <>
      <ProjectPanel projectId={ids.selected} onClose={() => close('selected')} onOpenMilestone={(id) => open('milestone', id)} />
      <MilestonePanel milestoneId={ids.milestone} onClose={() => close('milestone')} onOpenTask={(id) => open('task', id)} />
      <TaskPanel taskId={ids.task} onClose={() => close('task')} />
    </>
  );
}
