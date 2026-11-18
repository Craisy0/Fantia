# Skill di design installate

Scaricate da GitHub il 2026-11-18, controllate prima dell'installazione (nessun hook, nessun comando
automatico, nessuna chiamata di rete negli script). Non modificate.

| Skill | Origine | Commit | Licenza |
|---|---|---|---|
| frontend-design | https://github.com/anthropics/skills | e4bb5d9 | vedi `frontend-design/LICENSE.txt` |
| ui-ux-pro-max | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill | f2cc365 | MIT |
| emil-design-eng, animate, choreograph, animation-performance, review-animations, mobile-native, apple-design, gestures, break-ui, pick-ui-library | https://github.com/emilkowalski/skills | 64eb3de | MIT |

## Non installate, di proposito
- **Impeccable** (pbakaus/impeccable): il suo lanciatore scarica ed esegue un programma e installa hook
  che girano a ogni modifica di file. Solo con un consenso esplicito.
- **taste-skill** (Leonxlnx/taste-skill): dichiara un hook `Stop` che avvia Chrome per fino a 10 minuti a ogni
  risposta, ed è pensata per siti aziendali, non per app mobili.
