import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import { SIDEBAR_WIDTH } from '../theme';
import { Footer } from './Footer';
import { Sidebar } from './Sidebar';
import { WorkPanels } from '../pages/work/WorkPanels';
import { TopBar } from './TopBar';

/**
 * Shared layout for every signed-in page and role (prototype `RoleShell`):
 * fixed sidebar on desktop, slide-out drawer on small screens, top bar, the
 * current page, and the footer.
 */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <Box component="aside" sx={{ width: { md: SIDEBAR_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={closeMobile}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH } }}
        >
          <Sidebar onNavigate={closeMobile} />
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, borderRight: '1px solid #d8e2d8' },
          }}
        >
          <Sidebar />
        </Drawer>
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar onMenuClick={() => setMobileOpen(true)} />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            width: '100%',
            maxWidth: 1640,
            mx: 'auto',
            px: { xs: 2, md: 2.5, lg: 4 },
            pt: { xs: 2.875, md: 3, lg: 2.5 },
            pb: { xs: 2.875, md: 3, lg: 2 },
          }}
        >
          <Outlet />
          <Footer />
        </Box>
        <WorkPanels />
      </Box>
    </Box>
  );
}
