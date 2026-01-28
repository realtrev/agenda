/**
 * Editor configuration options
 * Control which features are enabled for each editor instance
 */
export interface EditorConfig {
	/** Enable/disable formatting marks */
	formatting?: {
		bold?: boolean;
		underline?: boolean;
	};

	/** Enable/disable link functionality */
	links?: boolean;

	/** Enable/disable project chip insertion */
	projectChips?: boolean;

	/** Enable/disable history operations */
	history?: boolean;

	/** Enable/disable content operations */
	content?: {
		insertText?: boolean;
		deleteRange?: boolean;
	};

	/** Enable/disable cursor operations */
	cursor?: {
		focus?: boolean;
		set?: boolean;
		selectAll?: boolean;
	};

	/** Enable/disable document operations */
	document?: {
		getJSON?: boolean;
		setJSON?: boolean;
		clear?: boolean;
		blocks?: boolean;
		merge?: boolean;
		split?: boolean;
	};

	/** Enable/disable bubble menu */
	bubbleMenu?: boolean;
}

/**
 * Default configuration - all features enabled
 */
export const DEFAULT_CONFIG: EditorConfig = {
	formatting: {
		bold: true,
		underline: true
	},
	links: true,
	projectChips: true,
	history: true,
	content: {
		insertText: true,
		deleteRange: true
	},
	cursor: {
		focus: true,
		set: true,
		selectAll: true
	},
	document: {
		getJSON: true,
		setJSON: true,
		clear: true,
		blocks: true,
		merge: true,
		split: true
	},
	bubbleMenu: true
};

/**
 * Merge user config with defaults
 */
export function mergeConfig(userConfig?: Partial<EditorConfig>): EditorConfig {
	if (!userConfig) return DEFAULT_CONFIG;

	return {
		formatting: { ...DEFAULT_CONFIG.formatting, ...userConfig.formatting },
		links: userConfig.links !== undefined ? userConfig.links : DEFAULT_CONFIG.links,
		projectChips: userConfig.projectChips !== undefined ? userConfig.projectChips : DEFAULT_CONFIG.projectChips,
		history: userConfig.history !== undefined ? userConfig.history : DEFAULT_CONFIG.history,
		content: { ...DEFAULT_CONFIG.content, ...userConfig.content },
		cursor: { ...DEFAULT_CONFIG.cursor, ...userConfig.cursor },
		document: { ...DEFAULT_CONFIG.document, ...userConfig.document },
		bubbleMenu: userConfig.bubbleMenu !== undefined ? userConfig.bubbleMenu : DEFAULT_CONFIG.bubbleMenu
	};
}
