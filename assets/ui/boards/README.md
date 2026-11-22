# Wooden Survivor Boards — clean/tall set (v53)

The **straight board (01) has been deleted from the current branch**.
The three remaining WebP assets have been regenerated as tall, empty
wooden surfaces with no baked-in character portraits, paper photo frames,
tape, text labels, or reserved Polaroid positions.

| Asset | Status | Image dimensions |
| --- | --- | --- |
| `wooden_board_02_hazard_dossier.webp` | **Active**, extra-wide clean Hazard Dossier with original rails and markings | 1183 × 1870 |
| `wooden_board_03_worn_wood.webp` | Clean alternative wooden surface | 879 × 1790 |
| `wooden_board_04_survivor_polaroids.webp` | Clean alternative wooden surface | 916 × 1717 |

All three preserve transparency along the edges and have increased vertical
aspect ratios for the extended survivor board beneath the game's logo.

The actual photograph, paper frame, tape and HTML name for Oliver and each
nearby NPC remain separate interactive DOM layers. They are NOT embedded in
these board images. The two-column dynamic NPC list continues to scroll.

The board is styled by `css/survivor-board.css`. The surrounding sidebar
and primary game-layout widths are unchanged.

UI v51: the wider Hazard Dossier is the active art. CSS provides inner rail-safe margins and four natural variations of angle for the *existing* NPC Polaroids; Oliver's portrait CSS and animation remain untouched. The old v50 image is replaced in the current branch.\n
UI v53: the active Hazard Dossier image was expanded on the wooden interior,
leaving the rusted rails and corners unchanged. The desktop grid gives the
left dossier up to 392px, shifting the scene right as requested without overlap.
Oliver's paper portrait, tape, angle, animation and NPC roster are unchanged.
