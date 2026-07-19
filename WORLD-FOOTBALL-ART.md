# Hi-Lo Royale world-football art system

Ten original, unbranded images generated for Hi-Lo Royale on 2026-07-18 with
the built-in OpenAI image-generation tool. They evoke a global football
championship without using FIFA marks, team crests, national flags, official
trophy/ball designs, recognizable athletes, or sponsor logos.

Optimized web masters live in `web/assets/world-football/`. Five smaller JPEG
derivatives used by Expo live in `ios/assets/world-football/`.

| Asset | Narrative job | Integrated placement |
| --- | --- | --- |
| `stadium-night.webp` | Global-event scale | Landing hero; iOS lobby match card; Open Graph preview |
| `crown-trophy.webp` | Ownable Hi-Lo prize | Pitch hero; Open Graph preview |
| `fans-erupt.webp` | Communal emotion | Landing engagement strip |
| `tunnel-final.webp` | Anticipation before play | Web handle gate and first-run guide; iOS sign-in |
| `penalty-spot.webp` | Six-second decision tension | Web arena question stage; pitch demo section |
| `trophy-lift.webp` | Payoff and spectacle | Landing engagement strip; pitch close |
| `global-football-network.webp` | Global live-data scale | Pitch data-moat visual |
| `fan-faceoff.webp` | Viral head-to-head loop | Landing engagement strip |
| `live-data-pitch.webp` | Events becoming predictions | Landing lobby section; pitch data flow |
| `crown-confetti.webp` | Shareable survival result | Landing final CTA; web/iOS results; exported streak card |

## Prompt set

Every prompt used the same visual system: premium cinematic sports campaign
art, deep navy/black, controlled cyan and crimson, warm gold, text-free and
unbranded.

1. **Stadium night:** an enormous packed modern football stadium immediately
   before kickoff, phone lights, pristine pitch, mist and central negative
   space for interface copy.
2. **Crown trophy:** an original tall gold cup combining a crown silhouette and
   faceted football, on a dark arena pedestal; explicitly not a replica of a
   real trophy.
3. **Fans erupt:** diverse supporters celebrating a decisive goal in generic
   cyan, crimson, black and gold clothing; candid editorial photography.
4. **Tunnel final:** anonymous players in two dark-kit rows waiting in a stadium
   tunnel, cyan/crimson rim light and a gold-lit pitch exit.
5. **Penalty spot:** an original unbranded ball on wet grass and chalk before a
   decisive kick, low camera, dark upper space for game UI.
6. **Trophy lift:** anonymous champions lifting an original crown-shaped cup,
   gold confetti and a darker lower third for results.
7. **Global network:** illuminated globe above a stadium with live-match arcs,
   pulses and an orbiting football; negative space for product copy.
8. **Fan faceoff:** two friendly competitive supporters in cyan and crimson
   scarves preparing a phone-based prediction duel.
9. **Live-data pitch:** top-down night pitch with event pulses, probability
   paths and five-minute window bands, without labels or numbers.
10. **Crown confetti:** a luminous original football crown above a stadium
    center circle, a ring of fan lights and portrait-safe result composition.

## Usage guidance

- Preserve the dark overlays in consuming UI so WCAG text contrast remains
  stable over variable crops.
- Use `stadium-night` as the only eager/fetch-priority image. All below-fold web
  images should remain lazy-loaded.
- Do not describe these as official World Cup or FIFA artwork. They are original
  “global football championship” campaign imagery.
- Keep gameplay controls on opaque or near-opaque surfaces. Imagery should
  heighten anticipation and payoff, never compete with a timed choice.
