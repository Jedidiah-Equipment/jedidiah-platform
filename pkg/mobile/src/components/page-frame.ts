/**
 * Where every signed-in page's content sits, defined once: 16pt sides, 32pt after the last content, and
 * 16pt between the toolbar and the first content. A main page's toolbar has no border and already ends
 * 12pt below its title, so its content adds 4pt; a secondary page's toolbar ends at its border line.
 * Styles, not classes, because NativeWind remaps `contentContainerClassName` for FlatList and ScrollView
 * but not SectionList.
 */
const SIDES_AND_END = { paddingHorizontal: 16, paddingBottom: 32 } as const;

export const MAIN_PAGE_CONTENT_STYLE = { ...SIDES_AND_END, paddingTop: 4 } as const;
export const SECONDARY_PAGE_CONTENT_STYLE = { ...SIDES_AND_END, paddingTop: 16 } as const;
