import { HudPanel } from '../../../components/Hud';
import { HouseCore, useHouseState } from '../../dashboard/HouseCore';

/** Home Core showing the state of the house, as large as the widget allows. */
export function StatusWidget() {
  const { state, color } = useHouseState();
  return (
    <HudPanel color={color} alert={state === 'ok' ? null : state} bodyClassName="cdash-fit grid place-items-center">
      <HouseCore size="min(100cqw, 100cqh, 18.125rem)" />
    </HudPanel>
  );
}
