import SpriteStyleModel, { IStyleLora } from '../../models/spriteStyleModel';
import { validateStyleAgainstManifest } from '../../config/manifest';

// ---------------------------------------------------------------------------
// Whether a style can actually run, as opposed to whether anyone wants it to.
//
// These are two independent facts and they are kept in two places on purpose:
//
//   isActive     — an admin decision. Only a human ever writes it.
//   unavailable  — derived from the manifest. Never stored, never written back.
//
// A style is offered when both hold. Collapsing them into one flag means a
// manifest reload silently re-enables a style someone deliberately switched
// off, and 'disabled' stops telling you who disabled it or why. Deriving also
// means a style broken by a bad manifest starts working again by itself once
// the manifest is fixed, with nobody having to remember to flip it back.
//
// There are a handful of styles, so computing this per request is free.
// ---------------------------------------------------------------------------

export interface AvailabilityInput {
  endpointKey: string;
  checkpointFilename: string;
  loras: Pick<IStyleLora, 'loraFilename'>[];
}

/** Human-readable reasons this style cannot run. Empty means it can. */
export function styleUnavailability(style: AvailabilityInput): string[] {
  return validateStyleAgainstManifest(
    style.endpointKey,
    style.checkpointFilename,
    style.loras.map((l) => l.loraFilename),
  );
}

export function isStyleRunnable(style: AvailabilityInput): boolean {
  return styleUnavailability(style).length === 0;
}

/** Offered to users: the admin wants it AND the deployed images can run it. */
export function isStyleOfferable(style: AvailabilityInput & { isActive: boolean }): boolean {
  return style.isActive && isStyleRunnable(style);
}

/**
 * Logs which enabled styles the current manifest can and cannot run. Called
 * after a manifest load or reload.
 *
 * Reporting only — deliberately writes nothing. If this flipped isActive, a
 * reload would undo admin decisions in both directions.
 */
export async function logStyleAvailability(): Promise<void> {
  const enabled = await SpriteStyleModel.find({ isActive: true })
    .select('styleId endpointKey checkpointFilename loras')
    .lean();

  const broken = enabled
    .map((s) => ({ styleId: s.styleId, reasons: styleUnavailability(s) }))
    .filter((s) => s.reasons.length > 0);

  if (broken.length === 0) {
    console.log(`[styles] all ${enabled.length} enabled style(s) can run on this manifest`);
    return;
  }

  console.warn(`[styles] ${broken.length} of ${enabled.length} enabled style(s) cannot run on this manifest:`);
  for (const { styleId, reasons } of broken) {
    console.warn(`[styles]   ${styleId}: ${reasons.join('; ')}`);
  }
}
