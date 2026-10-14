import PropTypes from "prop-types";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRefresh } from "../../context/useRefresh";
import { useToast } from "../../context/useToast";
import { SidePanel } from "../../components/SidePanel";
import { correctEntry, deleteEntry } from "../../services/hoursService";
import { monoFont } from "../../theme";
import { formatDate, formatHours, formatMoney, localToday } from "../../utils/format";


/**
 * View or correct one of my time entries (prototype "Correct time entry" drawer): change the
 * date, hours or note, or remove the entry, while its task is not completed.
 *
 * @param {{ entry: object|null, onClose: () => void }} props
 */
export function EntryPanel({ entry, onClose }) {
  return (
    <SidePanel
      open={entry !== null}
      title={entry?.editable ? "Correct time entry" : "Time entry"}
      onClose={onClose}
    >
      {entry && <EntryForm key={entry.id} entry={entry} onClose={onClose} />}
    </SidePanel>
  );
}

/** The entry's details and correction form; keyed by entry so each one starts from its own values. */
function EntryForm({ entry, onClose }) {
  const { bump } = useRefresh();
  const showToast = useToast();
  const [values, setValues] = useState({
    work_date: entry.work_date,
    hours: String(entry.hours),
    note: entry.note ?? "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const set = (field) => (event) =>
    setValues((v) => ({ ...v, [field]: event.target.value }));
  const changed =
    values.work_date !== entry.work_date ||
    Number(values.hours) !== entry.hours ||
    (values.note || "") !== (entry.note ?? "");

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = {};
    if (values.work_date !== entry.work_date)
      payload.work_date = values.work_date;
    if (Number(values.hours) !== entry.hours)
      payload.hours = Number(values.hours);
    if ((values.note || "") !== (entry.note ?? ""))
      payload.note = values.note || null;
    try {
      await correctEntry(entry.id, payload);
      showToast("Time entry corrected");
      bump();
      onClose();
    } catch (err) {
      setErrors(err.fields ?? { form: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteEntry(entry.id);
      showToast(`${formatHours(entry.hours)} removed from ${entry.task_code}`);
      bump();
      onClose();
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Typography
        sx={{ fontFamily: monoFont, fontSize: 11, color: "text.secondary" }}
      >
        {entry.task_code} · {entry.project_code}
      </Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 650, mt: 0.5 }}>
        {entry.task_title}
      </Typography>
      <Typography
        color="text.secondary"
        sx={{ fontSize: 12, mt: 0.25, mb: 2.5 }}
      >
        {entry.project_name} · {formatDate(entry.work_date)} ·{" "}
        {formatHours(entry.hours)} · {formatMoney(entry.cost)}
      </Typography>
      {!entry.editable && (
        <Box
          sx={{
            p: 1.75,
            bgcolor: "#eff3e5",
            color: "#4c6954",
            borderRadius: "5px",
            fontSize: 12,
          }}
        >
          {entry.task_status === "completed"
            ? "This task is completed and approved, so its hours are final."
            : "This entry can no longer be changed."}
          {entry.note && ` Note: ${entry.note}`}
        </Box>
      )}
      {entry.editable && (
        <Box component="form" onSubmit={save} sx={{ display: "grid", gap: 2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <TextField
              label="Date"
              type="date"
              value={values.work_date}
              onChange={set("work_date")}
              required
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: localToday() },
              }}
              error={!!errors.work_date}
              helperText={errors.work_date}
            />
            <TextField
              label="Hours"
              type="number"
              value={values.hours}
              onChange={set("hours")}
              required
              slotProps={{ htmlInput: { min: 0.25, max: 24, step: 0.25 } }}
              error={!!errors.hours}
              helperText={errors.hours}
            />
          </Box>
          <TextField
            label="Work note"
            value={values.note}
            onChange={set("note")}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            error={!!errors.note}
            helperText={errors.note}
          />
          {errors.form && (
            <Typography variant="caption" color="error">
              {errors.form}
            </Typography>
          )}
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, pt: 1 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={busy || !changed}
            >
              Save correction
            </Button>
            <Button type="button" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              color="error"
              onClick={() => setConfirming(true)}
              disabled={busy || confirming}
              sx={{ ml: "auto" }}
            >
              Remove entry
            </Button>
          </Box>
          {confirming && (
            <Box
              role="group"
              aria-label="Confirm removal"
              sx={{
                p: 1.75,
                bgcolor: "#faf0d9",
                color: "#88601c",
                borderRadius: "5px",
                fontSize: 12,
              }}
            >
              <Typography sx={{ fontSize: 12, mb: 1.25 }}>
                Remove {formatHours(entry.hours)} logged on{" "}
                {formatDate(entry.work_date)}? Your hours and cost on{" "}
                {entry.task_code} go down by that much.
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button
                  color="error"
                  variant="contained"
                  size="small"
                  onClick={remove}
                  disabled={busy}
                >
                  Confirm removal
                </Button>
                <Button
                  size="small"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  sx={{ color: "inherit" }}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )}
    </>
  );
}

const entryShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  work_date: PropTypes.string.isRequired,
  hours: PropTypes.number.isRequired,
  cost: PropTypes.number,
  note: PropTypes.string,
  task_code: PropTypes.string,
  task_title: PropTypes.string,
  task_status: PropTypes.string,
  project_code: PropTypes.string,
  project_name: PropTypes.string,
  editable: PropTypes.bool,
});

EntryForm.propTypes = {
  entry: entryShape.isRequired,
  onClose: PropTypes.func.isRequired,
};

EntryPanel.propTypes = {
  entry: entryShape,
  onClose: PropTypes.func.isRequired,
};
