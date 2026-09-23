import PropTypes from "prop-types";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Link as RouterLink } from "react-router";

import {
  CATEGORIES,
  formatDateTime,
  formatLocation,
  SCOPES,
} from "../../utils/ticketFormat";
import StatusLabel from "../tickets/StatusLabel";
import UrgencyLabel from "../tickets/UrgencyLabel";

/**
 * The employee's most recently updated open ticket, shown prominently at the top.
 * With no active tickets it says so instead.
 */
function ActiveTicketHighlight({ ticket }) {
  if (!ticket) {
    return (
      <Card>
        <CardContent>
          <Typography component="h2" variant="h6">
            No active tickets
          </Typography>
          <Typography color="text.secondary">
            You&apos;re all caught up. Anything you report will show up here.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      component="section"
      aria-labelledby="highlight-title"
      sx={{ borderLeft: 4, borderLeftColor: "primary.main" }}
    >
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          Most recent active ticket
        </Typography>
        <Typography
          id="highlight-title"
          component="h2"
          variant="h5"
          gutterBottom
        >
          <Link
            component={RouterLink}
            to={`/tickets/${ticket.ticket_id}`}
            color="inherit"
          >
            #{ticket.ticket_id} {ticket.title}
          </Link>
        </Typography>
        <Stack
          direction="row"
          sx={{ mb: 1.5, flexWrap: "wrap", columnGap: 3, rowGap: 1 }}
        >
          <StatusLabel status={ticket.status} />
          <Typography component="span" color="text.secondary">
            Urgency: <UrgencyLabel urgency={ticket.urgency} />
          </Typography>
          <Typography component="span" color="text.secondary">
            Impact: {SCOPES[ticket.affected_scope]}
          </Typography>
          <Typography component="span" color="text.secondary">
            {CATEGORIES[ticket.category]}
          </Typography>
        </Stack>
        <Typography sx={{ mb: 1.5 }}>{ticket.short_description}</Typography>
        <Typography variant="body2" color="text.secondary">
          {formatLocation(ticket)} · Updated {formatDateTime(ticket.updated_at)}
        </Typography>
      </CardContent>
    </Card>
  );
}

ActiveTicketHighlight.propTypes = {
  ticket: PropTypes.shape({
    ticket_id: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    short_description: PropTypes.string.isRequired,
    category: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    urgency: PropTypes.string.isRequired,
    affected_scope: PropTypes.string.isRequired,
    updated_at: PropTypes.string.isRequired,
  }),
};

export default ActiveTicketHighlight;
