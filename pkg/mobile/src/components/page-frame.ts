/** The toolbar's own padding above and below its contents, and the gap below a secondary page's border. */
export const TOOLBAR_INSET = 12;

/**
 * Where every signed-in page's content sits, defined once: 16pt sides and 32pt after the last content.
 * A main page's toolbar has no border, so its content starts 16pt below the toolbar's contents (the
 * toolbar's own inset plus 4pt). A secondary page's toolbar ends at its border line, and its content sits
 * the toolbar's inset below that line, mirroring the space above the line.
 * Styles, not classes, because NativeWind remaps `contentContainerClassName` for FlatList and ScrollView
 * but not SectionList.
 */
const SIDES_AND_END = { paddingHorizontal: 16, paddingBottom: 32 } as const;

export const MAIN_PAGE_CONTENT_STYLE = { ...SIDES_AND_END, paddingTop: 16 - TOOLBAR_INSET } as const;
export const SECONDARY_PAGE_CONTENT_STYLE = { ...SIDES_AND_END, paddingTop: TOOLBAR_INSET } as const;
