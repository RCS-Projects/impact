'use client';
import { useRef, useState } from 'react';
import type { FieldView, PickerPoint } from '@/shared/types';
import { LocationPicker } from './location-picker';
import { FieldInput, collectAnswers } from './field-input';
import { TurnstileWidget } from './turnstile-widget';
import { ReportGeometryPicker } from './report-geometry-picker';
import type { ReportGeometryMode, ReportGeometry } from '@/server/schema/report-geometry';

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
  geometryMode = 'point',
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
  geometryMode?: ReportGeometryMode;
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
  const [shareMessage, setShareMessage] = useState('');
  const [step, setStep] = useState(0);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<ReportGeometry | null>(null);
  const [geometryKind, setGeometryKind] = useState<'point' | 'polygon'>(
    geometryMode === 'polygon' ? 'polygon' : 'point',
  );
  const formRef = useRef<HTMLFormElement>(null);

  const needsExactConfirmation =
    mode === 'edit' && initial?.privacy === 'approximate' && privacy === 'exact';

  async function handleSubmit(form: FormData) {
    if (
      (geometryKind === 'point' && !point) ||
      (geometryKind === 'polygon' && !geometry) ||
      submitting
    )
      return;
    setSubmitting(true);
    setError('');
    try {
      const photoFields = fields.filter((f) => f.type === 'photo');
      const photoAnswers: Record<string, { uploadId: string }> = {};
      for (const field of photoFields) {
        const fileInput = document.getElementById(`f-${field.key}`) as HTMLInputElement | null;
        const file = fileInput?.files?.[0];
        if (file) {
          setUploadingPhoto(field.key);
          const formData = new FormData();
          formData.append('file', file);
          const uploadRes = await fetch('/api/uploads', { method: 'POST', body: formData });
          if (!uploadRes.ok) {
            const errData = (await uploadRes.json().catch(() => ({}))) as { error?: string };
            throw new Error(errData.error ?? `Failed to upload ${field.label}`);
          }
          const uploadData = (await uploadRes.json()) as { id: string };
          photoAnswers[field.key] = { uploadId: uploadData.id };
          setUploadingPhoto(null);
        }
      }
      const answers = collectAnswers(fields, form);
      if (mode === 'edit' && initial) {
        for (const field of photoFields) {
          const existing = initial.answers[field.key];
          if (existing && typeof existing === 'object' && 'uploadId' in existing)
            photoAnswers[field.key] ??= { uploadId: (existing as { uploadId: string }).uploadId };
        }
      }
      for (const [key, photo] of Object.entries(photoAnswers)) {
        answers[key] = photo;
      }
      const body = {
        latitude: point?.latitude ?? center[1],
        longitude: point?.longitude ?? center[0],
        ...(geometryKind === 'polygon' && geometry ? { geometry } : {}),
        privacy,
        answers,
        placeLabel: point?.placeLabel,
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
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not save the report. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    const publicPath = `/map/${reference}`;
    const publicUrl =
      typeof window !== 'undefined' ? `${window.location.origin}${publicPath}` : publicPath;
    async function sharePublicMap() {
      setShareMessage('');
      try {
        if (navigator.share)
          await navigator.share({ title: 'Impact incident map', url: publicUrl });
        else await navigator.clipboard?.writeText(publicUrl);
        setShareMessage('Public map link copied.');
      } catch {
        setShareMessage('Sharing was cancelled or unavailable.');
      }
    }
    async function copyPublicMap() {
      try {
        await navigator.clipboard?.writeText(publicUrl);
        setShareMessage('Public map link copied.');
      } catch {
        setShareMessage('Could not copy the public map link.');
      }
    }
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
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void sharePublicMap()}
              >
                Share public map
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => void copyPublicMap()}
              >
                Copy public map link
              </button>
              <a
                className="button button-secondary"
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on Facebook
              </a>
            </div>
            {shareMessage && (
              <p className="notice notice-success" role="status">
                {shareMessage}
              </p>
            )}
          </>
        ) : (
          <p className="notice notice-success">Your report has been updated.</p>
        )}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="report-form"
      action={handleSubmit}
      aria-label={mode === 'create' ? 'Submit a report' : 'Update your report'}
    >
      <ol className="report-steps" aria-label="Report steps">
        {['Location', 'Privacy', 'Incident details', 'Review and submit'].map((label, index) => (
          <li key={label} className={index === step ? 'active' : index < step ? 'complete' : ''}>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          {geometryMode === 'point_or_polygon' && (
            <fieldset className="field geometry-choice">
              <legend>What are you reporting?</legend>
              <label className="privacy-card">
                <input
                  type="radio"
                  name="geometry-kind"
                  checked={geometryKind === 'point'}
                  onChange={() => {
                    setGeometryKind('point');
                    setGeometry(null);
                  }}
                />{' '}
                <strong>Mark one location</strong>
                <span>Use a pin for one specific place.</span>
              </label>
              <label className="privacy-card">
                <input
                  type="radio"
                  name="geometry-kind"
                  checked={geometryKind === 'polygon'}
                  onChange={() => {
                    setGeometryKind('polygon');
                    setPoint(null);
                  }}
                />{' '}
                <strong>Draw an area</strong>
                <span>Draw the public area you searched or are describing.</span>
              </label>
            </fieldset>
          )}
          {geometryKind === 'point' ? (
            <LocationPicker
              center={center}
              reportingArea={reportingArea}
              value={point}
              onChange={setPoint}
            />
          ) : (
            <ReportGeometryPicker center={center} value={geometry} onChange={setGeometry} />
          )}
          {geometryKind === 'point' && (
            <p className="hint">Select an area, then use the map pin to adjust the location.</p>
          )}
        </>
      )}

      {step === 1 && geometryKind === 'point' && (
        <fieldset className="field">
          <legend>Location privacy</legend>
          <div className="privacy-cards">
            <label className="privacy-card">
              <input
                type="radio"
                name="privacy-choice"
                value="approximate"
                checked={privacy === 'approximate'}
                onChange={() => setPrivacy('approximate')}
              />
              <strong>Approximate (recommended)</strong>
              <span>
                Only a randomized pin within a 500-foot circle is shown publicly. Your exact
                position and address stay private.
              </span>
            </label>
            <label className="privacy-card">
              <input
                type="radio"
                name="privacy-choice"
                value="exact"
                checked={privacy === 'exact'}
                onChange={() => setPrivacy('exact')}
              />
              <strong>Exact location</strong>
              <span>
                Your exact pin is shown publicly. Choose this only if you are comfortable.
              </span>
            </label>
          </div>
        </fieldset>
      )}

      {step === 1 && geometryKind === 'point' && needsExactConfirmation && (
        <label className="notice notice-warn">
          <input
            type="checkbox"
            checked={confirmExact}
            onChange={(event) => setConfirmExact(event.target.checked)}
          />{' '}
          I understand this will publish my exact location publicly.
        </label>
      )}

      <div hidden={step !== 2}>
        {fields.map((field) => (
          <FieldInput key={field.key} field={field} defaultValue={initial?.answers[field.key]} />
        ))}
      </div>

      {step === 2 && mode === 'create' && (
        <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} />
      )}

      {step === 1 && geometryKind === 'polygon' && (
        <p className="notice notice-warn">
          Search areas are public and are not fuzzed. The polygon represents the area you are
          reporting.
        </p>
      )}

      {step === 3 && (
        <section className="review-card" aria-labelledby="review-heading">
          <h2 id="review-heading">Review your report</h2>
          <p>
            <strong>Location:</strong> {point?.placeLabel ?? 'Selected area on map'}
          </p>
          {geometryKind === 'point' && (
            <p>
              <strong>Privacy:</strong>{' '}
              {privacy === 'approximate' ? 'Approximate (recommended)' : 'Exact location'}
            </p>
          )}
          {geometryKind === 'polygon' && (
            <p>
              <strong>Geometry:</strong> Public search area
            </p>
          )}
          <p className="hint">
            Check your details before submitting. Your private edit link will be shown after a
            successful submission.
          </p>
        </section>
      )}

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      <div className="report-step-actions">
        {step > 0 && (
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setStep((value) => value - 1)}
          >
            Back
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            className="button"
            disabled={
              (step === 0 && (geometryKind === 'point' ? !point : !geometry)) ||
              (step === 1 && geometryKind === 'point' && needsExactConfirmation && !confirmExact)
            }
            onClick={() => {
              if (step === 2) {
                const invalid = formRef.current?.querySelector<HTMLElement>(':invalid');
                if (invalid) {
                  invalid.focus();
                  return;
                }
              }
              setStep((value) => value + 1);
            }}
          >
            Continue
          </button>
        ) : (
          <button
            className="button"
            disabled={
              (geometryKind === 'point' ? !point : !geometry) ||
              submitting ||
              uploadingPhoto !== null
            }
          >
            {submitting ? 'Saving…' : mode === 'create' ? 'Submit report' : 'Update report'}
          </button>
        )}
      </div>
      <p className="hint">
        Reports are crowdsourced. One report per person per incident — use your private edit link to
        update your situation instead of submitting again.
      </p>
    </form>
  );
}
