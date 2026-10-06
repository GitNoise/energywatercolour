/**
 * Annotation events joined to the chart by swoopy arrows.
 *
 * Field reference:
 * - `yr` — anchor year on the time axis
 * - `src` — source index in SOURCES, or -1 for total-energy events
 * - `side` — 'T' (above stream) or 'B' (below)
 * - `primary` — larger note style
 * - `span`, `kind` — multi-year highlights ('band' rectangle or 'oval')
 * - `drop` — red ink (year when total use fell)
 * - `pass` — blue ink (one source overtaking another)
 * - `corner` — prefer placement in the magnifier corner
 */
export const EVENTS = [
  { primary: true, yr: 1973, src: 1, side: 'B', title: '1973 · Oil crisis', body: 'The OPEC embargo. Oil use falls in 1974 and again in 1975.' },
  { primary: true, yr: 1979, src: 1, side: 'B', title: '1979 · Second oil shock', body: 'Oil peaks at 37,178 TWh and doesn’t pass that level again until 1989.' },
  { yr: 1981, span: [1980, 1982], kind: 'band', src: -1, side: 'B', drop: true, title: '1980–82 · Three years of decline', body: 'Total energy use falls three years in a row, by 0.9%, 0.5% and 0.5%.' },
  { yr: 1986, src: 3, side: 'T', title: '1986 · Chernobyl', body: 'Nuclear grew 3.7× in the decade before. In the decade after, 1.5×.' },
  { primary: true, yr: 2006, span: [2002, 2011], kind: 'oval', src: 0, side: 'B', title: '2002–11 · The coal boom', body: 'Coal use rises 52% in nine years, mostly in China.' },
  { yr: 2006, src: 3, side: 'T', title: '2006 · Nuclear peaks', body: 'At 7,495 TWh. In 2024 it is still below that, at 6,872.' },
  { yr: 2009, src: -1, side: 'B', drop: true, title: '2009 · Financial crisis', body: 'Global energy use falls 1.6%.' },
  { yr: 2011, src: 3, side: 'T', title: '2011 · Fukushima', body: 'Nuclear output drops 7.3% the following year.' },
  { primary: true, yr: 2018, span: [2014, 2024], kind: 'band', src: 6, side: 'T', title: '2014–24 · Solar takes off', body: 'From 502 TWh to 5,151 TWh in ten years, more than tenfold.' },
  { primary: true, yr: 2020, span: [2019.5, 2020.5], kind: 'band', src: -1, side: 'B', drop: true, title: '2020 · Covid-19', body: 'Demand falls 3.5%, the largest drop in this record, then rebounds 5.1% in 2021.' },
  { yr: 2001, pass: [3, 4], side: 'T', title: '2001 · Nuclear passes hydro', body: '7,330 TWh to 7,123. Hydro takes the lead back in 2004 and keeps it.' },
  { yr: 2003, pass: [5, 7], side: 'T', title: '2003 · Wind passes biofuels', body: '172 TWh to 169. Wind stays ahead from here on.' },
  { yr: 2012, pass: [5, 8], side: 'T', title: '2012 · Wind passes other renewables', body: '1,368 TWh to 1,340.' },
  { yr: 2017, pass: [6, 7], side: 'T', title: '2017 · Solar passes biofuels', body: '1,115 TWh to 958.' },
  { yr: 2021, pass: [6, 8], side: 'T', corner: true, title: '2021 · Solar passes other renewables', body: '2,593 TWh to 2,318. By 2024 it is closing in on wind: 5,151 against 6,125.' },
];
