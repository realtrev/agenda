import type { Editor as TipTapEditor } from '@tiptap/core';

export interface PopupState {
	isVisible: boolean;
	component: any;
	markName: string;
	attrs: Record<string, any>;
	markStart: number;
	markEnd: number;
	onAction: (action: (editor: TipTapEditor, attrs: Record<string, any>) => void) => void;
	onHide: () => void;
}

export interface PopupAPI {
	getCursorMark: (markName: string) => Record<string, any> | null;
	getMarkRange: (markName: string) => { from: number; to: number } | null;
	getMarkCoordinates: (markStart: number) => { left: number; bottom: number } | null;
	show: (markName: string, component: any, attrs?: Record<string, any>) => void;
	hide: () => void;
	checkAndShow: (markName: string, component: any) => void;
	autoHide: () => void;
	getCurrentState: () => PopupState;
}

export function createPopupAPI(
	editor: TipTapEditor,
	LinkPopupComponent: any,
	onStateChange: (state: PopupState) => void
): PopupAPI {
	let currentState: PopupState = {
		isVisible: false,
		component: LinkPopupComponent,
		markName: '',
		attrs: {},
		markStart: 0,
		markEnd: 0,
		onAction: () => {},
		onHide: () => {}
	};
	let suppressCheckAndShow = false;

	function getCursorMark(markName: string): Record<string, any> | null {
		const { $from } = editor.state.selection;
		const mark = $from.marks().find((m) => m.type.name === markName);
		return mark ? mark.attrs : null;
	}

	function getMarkRange(markName: string): { from: number; to: number } | null {
		const { $from } = editor.state.selection;
		const mark = $from.marks().find((m) => m.type.name === markName);

		if (!mark) return null;

		let start = $from.pos;
		let end = $from.pos;

		// Walk backwards to find mark start
		while (start > 0) {
			const beforePos = editor.state.doc.resolve(start - 1);
			const hasMark = beforePos.marks().some((m) => m.type.name === markName);
			if (!hasMark) break;
			start--;
		}

		// Walk forwards to find mark end
		while (end < editor.state.doc.content.size) {
			const afterPos = editor.state.doc.resolve(end + 1);
			const hasMark = afterPos.marks().some((m) => m.type.name === markName);
			if (!hasMark) break;
			end++;
		}

		return { from: start, to: end };
	}

	function getMarkCoordinates(markStart: number): { left: number; bottom: number } | null {
		try {
			const coords = editor.view.coordsAtPos(markStart - 1);
			return { left: coords.left, bottom: coords.bottom };
		} catch {
			return null;
		}
	}

	function show(markName: string, component: any, attrs?: Record<string, any>) {
		const range = getMarkRange(markName);
		if (!range) return;

		currentState = {
			isVisible: true,
			component,
			markName,
			attrs: attrs || getCursorMark(markName) || {},
			markStart: range.from,
			markEnd: range.to,
			onAction: (action: (editor: TipTapEditor, attrs: Record<string, any>) => void) => {
				action(editor, currentState.attrs);
			},
			onHide: () => {
				hide();
			}
		};

		onStateChange(currentState);
	}

	function hide() {
		currentState = {
			...currentState,
			isVisible: false
		};
		suppressCheckAndShow = true;
		onStateChange(currentState);
		// Reset after 150ms to prevent re-showing on keyup/other events that follow hide
		setTimeout(() => {
			suppressCheckAndShow = false;
		}, 150);
	}

	function checkAndShow(markName: string, component: any) {
		// Don't reappear if we just hid
		if (suppressCheckAndShow) return;

		const attrs = getCursorMark(markName);
		if (attrs) {
			show(markName, component, attrs);
		} else {
			hide();
		}
	}

	function autoHide() {
		hide();
	}

	function getCurrentState(): PopupState {
		return currentState;
	}

	return {
		getCursorMark,
		getMarkRange,
		getMarkCoordinates,
		show,
		hide,
		checkAndShow,
		autoHide,
		getCurrentState
	};
}
