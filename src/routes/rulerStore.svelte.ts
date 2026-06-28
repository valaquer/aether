// client-only — ruler overlay state + drag handlers

let showRuler = $state(false);
let rulerX = $state(100);
let rulerY = $state(200);
let dragging = $state(false);
let dragOffsetX = 0;
let dragOffsetY = 0;

export function getShowRuler() { return showRuler; }
export function toggleRuler() { showRuler = !showRuler; }
export function getRulerX() { return rulerX; }
export function getRulerY() { return rulerY; }
export function getDragging() { return dragging; }

export function onRulerMouseDown(e: MouseEvent) {
	dragging = true;
	dragOffsetX = e.clientX - rulerX;
	dragOffsetY = e.clientY - rulerY;
	e.preventDefault();
}

export function onRulerMouseMove(e: MouseEvent) {
	if (!dragging) return;
	rulerX = e.clientX - dragOffsetX;
	rulerY = e.clientY - dragOffsetY;
}

export function onRulerMouseUp() {
	dragging = false;
}
