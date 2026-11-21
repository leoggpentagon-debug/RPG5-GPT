# Sound effects in 28 Days Later: Survival

The 17 listed legacy OGG samples below are original unmodified audio from **Kenney**,
distributed under **Creative Commons Zero (CC0 1.0 Universal)**. Attribution is
not required, but their sources are preserved here for provenance and re-use.

- RPG Audio (books, paper and creaks): https://kenney.nl/assets/rpg-audio
- Interface Sounds (clicks and responses): https://kenney.nl/assets/interface-sounds
- UI Audio (hover): https://kenney.nl/assets/ui-audio
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Downloaded via CC0 collection mirror: https://github.com/Mcamento8/open-game-sfx-index

| RPG6 file | Kenney source file |
| --- | --- |
| `assets/audio/paper_brush.ogg` | `audio/rpg-audio/bookFlip1.ogg` |
| `assets/audio/book_open.ogg` | `audio/rpg-audio/bookOpen.ogg` |
| `assets/audio/book_close.ogg` | `audio/rpg-audio/bookClose.ogg` |
| `assets/audio/page_turn.ogg` | `audio/rpg-audio/bookFlip2.ogg` |
| `assets/audio/page_turn_alt.ogg` | `audio/rpg-audio/bookFlip3.ogg` |
| `assets/audio/paper_stamp.ogg` | `audio/rpg-audio/bookPlace2.ogg` |
| `assets/audio/paper_rustle.ogg` | `audio/rpg-audio/cloth1.ogg` |
| `assets/audio/leather_creak.ogg` | `audio/rpg-audio/creak2.ogg` |
| `assets/audio/ui_click.ogg` | `audio/interface-sounds/click_001.ogg` |
| `assets/audio/ui_select.ogg` | `audio/interface-sounds/select_001.ogg` |
| `assets/audio/ui_hover.ogg` | `audio/ui-audio/rollover2.ogg` |
| `assets/audio/ui_confirm.ogg` | `audio/interface-sounds/confirmation_001.ogg` |
| `assets/audio/ui_back.ogg` | `audio/interface-sounds/back_001.ogg` |
| `assets/audio/ui_open.ogg` | `audio/interface-sounds/open_001.ogg` |
| `assets/audio/ui_close.ogg` | `audio/interface-sounds/close_001.ogg` |
| `assets/audio/ui_error.ogg` | `audio/interface-sounds/error_004.ogg` |
| `assets/audio/ui_toggle.ogg` | `audio/interface-sounds/switch_001.ogg` |

Audio is client-only feedback; sounds do not modify game state or imply success.

## Other character stat effects: original 2026-11-21 selection

The following **four non-stress** clips remain untouched. They are
edited mono OGG/Opus versions of user-supplied MP3s, played only on the
corresponding dossier characteristic. These are independent of the stress system.

| Stat | Original uploaded file | Source range (seconds) | Duration |
| --- | --- | --- | --- |
| Health | `u_akyu645azf-heartbeat-sound-effects-for-you-122458.mp3` | 0.12–1.05 | 0.93s |
| Stamina | `ribhavagrawal-heavy-breathing-sound-effect-type-02-294195.mp3` | 1.80–3.13 | 1.33s |
| Hunger | `shut_up_ghost-frying-food-cooking-kitchen-free-sound-effect-382865.mp3` | 7.04–8.53 | 1.49s |
| Thirst | `soul_serenity_sounds-random-water-drop-ripple-241044.mp3` | 1.93–2.89 | 0.96s |

Existing output names: `assets/audio/stat_<name>.ogg`.
The older `stat_electric.ogg` remains in the repository but is not played.

## Stress sound replacement — approved 2026-11-21

**The old `assets/audio/stat_stress.ogg` has been removed.** No earlier
stress clip is played. New files live in `assets/audio/stress/`.
The first MP3 is the previously approved eight-second edit, fading from
6 to 8 seconds. The other nine MP3s are **byte-for-byte original uploads**.

| Current stress | File in `assets/audio/stress/` | Behavior |
| --- | --- | --- |
| 0/5 and 1/5 | `woodland_birdies_stress_0-1_8s_fade.mp3` | First 8 seconds; fade out at the end |
| 2/5 | `universfield-old-wooden-door-402153.mp3` | Original |
| 3/5 | `dragon-studio-scary-bells-359875.mp3` | Original |
| 4/5 | `freeeverythingxx-open-the-door-horror-268582.mp3` | Original |
| 5/5 | `freesound_community-demonic-whisper-100425.mp3` | Random candidate 1/6 |
| 5/5 | `freesound_community-075283_quotbehind-youquot-whisper-86744.mp3` | Random candidate 1/6 |
| 5/5 | `dragon-studio-ghost-whisper-351569.mp3` | Random candidate 1/6 |
| 5/5 | `freesound_community-four_voices_whispering-6943.mp3` | Random candidate 1/6 |
| 5/5 | `yodguard-dark-spell-chant-3-533018.mp3` | Random candidate 1/6 |
| 5/5 | `freesound_community-creepy-moan-87456.mp3` | Random candidate 1/6 |

Playback occurs when the **Stress** statistic is hovered/focused in the
character dossier, using the current numerical stress value from RPG6.
At 5/5, one of the six clips is selected independently with equal
probability for each eligible playback; repeats are allowed. Only one
stat sound plays at once. The regular UI sound enable/volume control applies.
None of these sounds changes game state.

All these MP3s were supplied/approved by the user. The exact public
distribution license for each recording was not independently verified;
their filenames alone do not prove CC0 status.
