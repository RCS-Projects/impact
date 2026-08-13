'use client';
import { useState } from 'react';
import type { FieldView, PickerPoint } from '@/shared/types';
import { LocationPicker } from './location-picker';
import { FieldInput, collectAnswers } from './field-input';
import { TurnstileWidget } from './turnstile-widget';

export interface EditInitialData {
  answers: Record<string, unknown>;
  privacy: 'exact' | 'approximate';
  latitude: number;
  longitude: number;
  placeLabel: string | null;
}

export function ReportForm({
  reference,
  fields,
  center,
  reportingArea,
  turnstileSiteKey,
  mode,
  reportId,
  editToken,
  initial,
}: {
  reference: string;
  fields: FieldView[];
  center: [number, number];
  reportingArea: unknown | null;
  turnstileSiteKey: string | null;
  mode: 'create' | 'edit';
  reportId?: string;
  editToken?: string;
  initial?: EditInitialData;
}) {
  const [point, setPoint] = useState<PickerPoint | null>(
    initial
      ? {
          latitude: initial.latitude,
          longitude: initial.longitude,
          placeLabel: initial.placeLabel ?? undefined,
        }
      : null,
  );
  const [privacy, setPrivacy] = useState<'exact' | 'approximate'>(
    initial?.privacy ?? 'approximate',
  );
  const [confirmExact, setConfirmExact] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ editUrl?: string; flagged: boolean } | null>(null);

  const needsExactConfirmation =
    mode === 'edit' && initial?.privacy === 'approximate' && privacy === 'exact';

  async function handleSubmit(form: FormData) {
    if (!point || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const answers = collectAnswers(fields, form);
      const body = {
        latitude: point.latitude,
        longitude: point.longitude,
        privacy,
        answers,
        placeLabel: point.placeLabel,
        ...(mode === 'create' ? { turnstileToken: turnstileToken ?? undefined } : {}),
        ...(needsExactConfirmation ? { confirmExact: true } : {}),
      };
      const response = await fetch(
        mode === 'create'
          ? `/api/incidents/${reference}/reports`
          : `/api/reports/${reportId}/edit/${editToken}`,
        {
          method: mode === 'create' ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        editUrl?: string;
        flagged?: boolean;
      };
      if (!response.ok) {
        setError(data.error ?? 'Could not save the report. Please try again.');
        return;
      }
      if (mode === 'create') setSuccess({ editUrl: data.editUrl, flagged: data.flagged ?? false });
      else setSuccess({ flagged: false });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="form-block" role="status">
        <h2>Thank you — your report has been saved.</h2>
        {success.flagged && (
          <p className="notice notice-warn">
            Your report was automatically held for review by moderators. It will appear on the map
            once approved.
          </p>
        )}
        {mode === 'create' && success.editUrl ? (
          <>
            <p>
              <strong>Save your private edit link.</strong> It is the only way to update your report
              later. Anyone with this link can edit the report, so keep it private.
            </p>
            <p className="edit-link-box">
              {typeof window !== 'undefined' ? window.location.origin : ''}
              {success.editUrl}
            </p>
            <div className="buttons">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  void navigator.clipboard?.writeText(
                    `${window.location.origin}${success.editUrl}`,
                  );
                }}
              >
                Copy edit link
              </button>
              <a className="button" href={`/map/${reference}`}>
                View the map
              </a>
            </div>
          </>
        ) : (
          <p className="notice notice-success">Your report has been updated.</p>
        )}
      </div>
    );
  }

  return (
    <form
      className="report-form"
      action={handleSubmit}
      aria-label={mode === 'create' ? 'Submit a report' : 'Update your report'}
    >
      <LocationPicker
        center={center}
        reportingArea={reportingArea}
        value={point}
        onChange={setPoint}
      />

      <fieldset className="field">
        <legend>Location privacy</legend>
        <div className="privacy-cards" role="radiogroup" aria-label="Location privacy choice">
          <div
            className="privacy-card"
            role="radio"
            aria-checked={privacy === 'approximate'}
            tabIndex={0}
            onClick={() => setPrivacy('approximate')}
            onKeyDown={(event) => event.key === 'Enter' && setPrivacy('approximate')}
          >
            <strong>Approximate (recommended)</strong>
            <span>
              Only a randomized pin within a 500-foot circle is shown publicly. Your exact position
              and address stay private.
            </span>
          </div>
          <div
            className="privacy-card"
            role="radio"
            aria-checked={privacy === 'exact'}
            tabIndex={0}
            onClick={() => setPrivacy('exact')}
            onKeyDown={(event) => event.key === 'Enter' && setPrivacy('exact')}
          >
            <strong>Exact location</strong>
            <span>Your exact pin is shown publicly. Choose this only if you are comfortable.</span>
          </div>
        </div>
        <input
          className="visually-hidden"
          type="radio"
          name="privacy-choice"
          checked={privacy === 'approximate'}
          onChange={() => setPrivacy('approximate')}
        />
      </fieldset>

      {needsExactConfirmation && (
        <label className="notice notice-warn">
          <input
            type="checkbox"
            checked={confirmExact}
            onChange={(event) => setConfirmExact(event.target.checked)}
          />{' '}
          I understand this will publish my exact location publicly.
        </label>
      )}

      {fields.map((field) => (
        <FieldInput key={field.key} field={field} defaultValue={initial?.answers[field.key]} />
      ))}

      {mode === 'create' && (
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
      )}

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <button
        className="button"
        disabled={!point || submitting || (needsExactConfirmation && !confirmExact)}
      >
        {submitting ? 'Saving…' : mode === 'create' ? 'Submit report' : 'Update report'}
      </button>
      <p className="hint">
        Reports are crowdsourced. One report per person per incident — use your private edit link to
        update your situation instead of submitting again.
      </p>
    </form>
  );
}
