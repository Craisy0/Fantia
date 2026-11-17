// Promemoria locali. Nel browser non fanno nulla.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { parseStamp } from '../core/time.js';

const native = () => Capacitor.isNativePlatform();
const DAILY_IDS = [1, 2, 3, 4, 5, 6, 7]; // uno per giorno della settimana
const LONG_SHIFT_ID = 100;

export async function askPermission() {
  if (!native()) return false;
  const res = await LocalNotifications.requestPermissions();
  return res.display === 'granted';
}

/** Riallinea le notifiche programmate allo stato attuale. */
export async function syncReminders(state, now = new Date()) {
  if (!native()) return;
  try {
    await LocalNotifications.cancel({ notifications: [...DAILY_IDS, LONG_SHIFT_ID].map((id) => ({ id })) });
    const { reminder, longShiftHours } = state.settings;
    const list = [];
    if (reminder.enabled) {
      const [hour, minute] = reminder.time.split(':').map(Number);
      for (const day of reminder.days) {
        list.push({
          id: DAILY_IDS[day],
          title: 'Ore Lavoro',
          body: 'Hai registrato le ore di oggi?',
          schedule: { on: { weekday: day + 1, hour, minute }, allowWhileIdle: true },
        });
      }
    }
    const open = state.shifts.find((x) => !x.end);
    if (open && longShiftHours > 0) {
      const at = new Date(parseStamp(open.start).getTime() + longShiftHours * 3600000);
      if (at > now) {
        list.push({
          id: LONG_SHIFT_ID,
          title: 'Turno ancora aperto',
          body: `Sei in turno da ${longShiftHours} ore: hai dimenticato di timbrare l'uscita?`,
          schedule: { at, allowWhileIdle: true },
        });
      }
    }
    if (list.length) await LocalNotifications.schedule({ notifications: list });
  } catch (err) {
    console.warn('Promemoria non programmati', err);
  }
}
