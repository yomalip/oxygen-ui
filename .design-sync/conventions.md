## How to build with Oxygen UI

Oxygen UI is WSO2's component library built on **Material UI v7**. It re-exports all of MUI, restyles
it with WSO2 theming, and adds custom app-shell and data components. If you know MUI, you know most of
this — the important differences are below.

### Always wrap in `OxygenUIThemeProvider`

Nothing is styled without it. It supplies the theme, the colour scheme, and the `Inter Variable` font;
omit it and components render with MUI's stock defaults and a fallback font.

```jsx
const {OxygenUIThemeProvider, WSO2Theme, Button} = OxygenUI;

<OxygenUIThemeProvider theme={WSO2Theme}>
  <Button variant="contained">Get started</Button>
</OxygenUIThemeProvider>
```

Three usable forms: bare `<OxygenUIThemeProvider>` (default theme), a single `theme={X}`, or
`themes={[{key, label, theme}]}` + `initialTheme="key"` when you want the `ThemeSwitcher` to work.

**Themes** (all real exports): `WSO2Theme`, `ClassicTheme`, `AcrylicOrangeTheme`,
`AcrylicPurpleTheme`, `HighContrastTheme`, `PaleGrayTheme`, `PaleIndigoTheme`, `OxygenTheme`,
`PaleBaseTheme`. Build one with `extendTheme({...})` or `createOxygenTheme({...})`.
Hooks: `useTheme`, `useThemeSwitcher`, `useColorScheme`.

### Styling: the `sx` prop and theme tokens — there are NO utility classes

This is a CSS-in-JS system (Emotion). Do not write utility class names like `bg-surface` or `p-4`;
they resolve to nothing. Style through `sx`, and use **theme token strings**, not raw hex or px:

```jsx
<Box sx={{p: 2, bgcolor: 'background.paper', color: 'text.primary', borderRadius: 1}} />
```

The token vocabulary you can put in `sx` (real MUI v7 theme paths):

| Concern | Use |
|---|---|
| Palette | `primary.main` / `.light` / `.dark` / `.contrastText`, and the same for `secondary`, `error`, `warning`, `info`, `success` |
| Surfaces | `background.default`, `background.paper` |
| Text | `text.primary`, `text.secondary`, `text.disabled` |
| Dividers/edges | `divider` |
| Spacing | numbers on `p`/`m`/`gap`/`px`/`py` etc. — `2` means 2 spacing units, not 2px |
| Type | `<Typography variant="h1…h6" \| "subtitle1" \| "subtitle2" \| "body1" \| "body2" \| "button" \| "caption" \| "overline">` |
| Elevation | `<Paper elevation={0…24}>` |

Prefer composing the library's own components (`Stack`, `Box`, `Grid`, `Container`, `Paper`) over
hand-rolled layout divs.

### Custom Oxygen components (not in MUI)

- **App chrome**: `AppShell`, `Layout`, `Header`, `Sidebar`, `Footer`, `PageContent`, `PageTitle`,
  `AppBreadcrumbs`, `UserMenu`
- **Data**: `ListingTable` (compound — `ListingTable.Provider` / `.Container` / `.Head` / `.Body` /
  `.Footer` / `.Row` / `.Cell` / `.Toolbar` / `.SortLabel` / `.DensityControl` / `.EmptyState` /
  `.RowActions` / `.CellIcon`; supports `variant="table"` and `variant="card"`), `StatCard`, `CodeBlock`
- **Forms**: `Form.CardButton`, `Form.Section`, `Form.Stack`, `Form.Wizard`
- **Inputs**: `SearchBar`, `SearchBarWithAdvancedFilter`, `ComplexSelect`
- **Feedback**: `NotificationPanel`, `NotificationBanner`
- **Theming**: `ThemeSwitcher`, `ColorSchemeToggle`, `ColorSchemeImage`, `ColorSchemeSVG`
- **Motion**: `ParticleBackground`

### Compound namespaces — reach through `.Sub`

`DataGrid`, `DatePickers`, `TreeView` and `Form` are namespace objects, not components:
`<DataGrid.DataGrid rows={rows} columns={cols} />`, `<DatePickers.DatePicker … />`,
`<TreeView.SimpleTreeView>`, `<Form.Section>`. Using them bare renders nothing.

**Charts** are also on the global: `AreaChart`, `BarChart`, `LineChart`, `PieChart`, `RadarChart`,
`RadialBarChart`, plus recharts primitives (`XAxis`, `YAxis`, `Bar`, `Line`, `Area`, `Radar`,
`Pie`, `RadialBar`, `CartesianGrid`, `Legend`, `ResponsiveContainer`, `Cell`).

**Icons** come from the sibling icons package (lucide-based) and are merged onto the same global —
`Search`, `Settings`, `Inbox`, `Plus` and so on. One caveat: the stroke width of an icon depends on a
side-effect stylesheet, so if a large icon looks too heavy, set `strokeWidth` explicitly.

### Where the real truth lives

Read these before styling anything unusual: `_ds/<folder>/styles.css` and its `@import` closure (that
is the whole stylesheet the design receives), and the per-component `<Name>.prompt.md` and
`<Name>.d.ts` next to each component. The `.d.ts` is the actual prop contract — trust it over any
summary, including this one.

### A worked example

```jsx
const {OxygenUIThemeProvider, WSO2Theme, Stack, Paper, Typography, Button, Chip} = OxygenUI;

<OxygenUIThemeProvider theme={WSO2Theme}>
  <Stack spacing={2} sx={{p: 3, bgcolor: 'background.default'}}>
    <Typography variant="h5">Deployments</Typography>
    <Paper elevation={1} sx={{p: 2, display: 'flex', alignItems: 'center', gap: 2}}>
      <Typography variant="body1" sx={{flexGrow: 1}}>api-gateway</Typography>
      <Chip label="Healthy" color="success" size="small" />
      <Button variant="contained">Redeploy</Button>
    </Paper>
  </Stack>
</OxygenUIThemeProvider>
```
