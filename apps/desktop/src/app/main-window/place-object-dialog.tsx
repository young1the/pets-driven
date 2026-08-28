import { Button, Dialog } from "@pets-driven/design-system";
import { useTranslation } from "@pets-driven/i18n";
import type { DesktopObjectCounts } from "@/app/desktop-host/use-desktop-simulation-host";
import { ballArtDataUri } from "@/artwork/prop-artwork";
import "@/app/main-window/place-object-dialog.css";

/**
 * "Place on the desktop": the one surface for putting a non-pet entity into the
 * world.
 *
 * A dialog rather than more header buttons because the world already has two
 * families of these — trinkets a pet collects and props it plays with — and the
 * list is the part expected to grow. Each row explains what its entity *does*,
 * which a header icon cannot, and says how many are already out there, which is
 * the question a user actually has before adding another.
 *
 * The two rows are deliberately not symmetrical, because the entities are not:
 * a trinket expires on its own, so it only ever needs a "place"; a prop is
 * furniture that nothing sweeps away, so it needs a way back out.
 */

export interface PlaceObjectDialogProps {
  open: boolean;
  onClose: () => void;
  counts: DesktopObjectCounts;
  /** Hand-drop a random trinket (wings or claws) onto a desktop floor. */
  onPlaceTreat: () => void;
  /** Put a ball on a desktop floor. */
  onPlaceBall: () => void;
  /** Take every prop back off the desktop. */
  onClearProps: () => void;
  /**
   * Whether anything can be placed at all. A drop needs a floor, and a floor
   * only exists once the desktop world is running — which it is not until at
   * least one pet is out. Placing into nothing would silently do nothing.
   */
  canPlace: boolean;
}

export function PlaceObjectDialog({
  open,
  onClose,
  counts,
  onPlaceTreat,
  onPlaceBall,
  onClearProps,
  canPlace,
}: PlaceObjectDialogProps) {
  const { t } = useTranslation("desktop");

  return (
    <Dialog onClose={onClose} open={open} title={t("place.title")}>
      <p className="pd-place__lead">{canPlace ? t("place.lead") : t("place.noPets")}</p>

      <ul className="pd-place__list">
        <li className="pd-place__row">
          <span aria-hidden="true" className="pd-place__glyph">
            🍪
          </span>
          <div className="pd-place__body">
            <span className="pd-place__name">{t("place.treat.name")}</span>
            <span className="pd-place__note">{t("place.treat.note")}</span>
            {counts.treats > 0 && (
              <span className="pd-place__count">{t("place.onDesktop", { n: counts.treats })}</span>
            )}
          </div>
          <div className="pd-place__actions">
            <Button disabled={!canPlace} onClick={onPlaceTreat} size="sm" variant="accent">
              {t("place.place")}
            </Button>
          </div>
        </li>

        <li className="pd-place__row">
          {/* The real artwork, not a stand-in emoji: the row is a picture of
              what will land on the desktop, and a different drawing here would
              be a small lie about what the button does. */}
          {/* draggable={false} for the same reason the overlay carries it: an
              image element is draggable by default, and peeling the ball out
              of the app is not a gesture this row is offering. */}
          <img
            alt=""
            className="pd-place__glyph pd-place__glyph--art"
            draggable={false}
            src={ballArtDataUri()}
          />
          <div className="pd-place__body">
            <span className="pd-place__name">{t("place.ball.name")}</span>
            <span className="pd-place__note">{t("place.ball.note")}</span>
            {counts.props > 0 && (
              <span className="pd-place__count">{t("place.onDesktop", { n: counts.props })}</span>
            )}
          </div>
          <div className="pd-place__actions">
            <Button disabled={!canPlace} onClick={onPlaceBall} size="sm" variant="accent">
              {t("place.place")}
            </Button>
            <Button
              disabled={counts.props === 0}
              onClick={onClearProps}
              size="sm"
              variant="neutral"
            >
              {t("place.clear")}
            </Button>
          </div>
        </li>
      </ul>
    </Dialog>
  );
}
