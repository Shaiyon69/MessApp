package com.shaiyon.messapp

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.Choreographer
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.lang.ref.WeakReference
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

@CapacitorPlugin(name = "NativeMiniPlayerDrag")
class NativeMiniPlayerDragPlugin : Plugin() {
    companion object {
        private var activePlugin = WeakReference<NativeMiniPlayerDragPlugin>(null)

        @JvmStatic
        fun onActivityTouchEvent(event: MotionEvent) {
            activePlugin.get()?.handleActivityTouchEvent(event)
        }
    }

    private data class DragSession(
        val id: String,
        val overlay: NativeDragOverlay,
        val root: ViewGroup,
        val scale: Float,
        val webOffsetX: Float,
        val webOffsetY: Float,
        val originX: Float,
        val originY: Float,
        val startTouchX: Float,
        val startTouchY: Float,
        val minX: Float,
        val minY: Float,
        val maxX: Float,
        val maxY: Float,
        var pendingX: Float,
        var pendingY: Float,
        var frameScheduled: Boolean = false,
        var ended: Boolean = false
    )

    private var session: DragSession? = null
    private var pointerDown = false
    private var activePointerId = MotionEvent.INVALID_POINTER_ID
    private var latestTouchX = 0f
    private var latestTouchY = 0f

    override fun load() {
        activePlugin = WeakReference(this)
    }

    @PluginMethod
    fun startDrag(call: PluginCall) {
        val id = call.getString("id")
        val x = call.getDouble("x")
        val y = call.getDouble("y")
        val width = call.getDouble("width")
        val height = call.getDouble("height")
        val startX = call.getDouble("startX")
        val startY = call.getDouble("startY")
        val viewportWidth = call.getDouble("viewportWidth")
        val viewportHeight = call.getDouble("viewportHeight")
        val scale = call.getDouble("scale", 1.0)?.toFloat() ?: 1f
        val gutter = call.getDouble("gutter", 8.0)?.toFloat() ?: 8f

        if (
            id.isNullOrBlank() ||
            x == null || y == null || width == null || height == null ||
            startX == null || startY == null ||
            viewportWidth == null || viewportHeight == null ||
            scale <= 0f
        ) {
            call.resolve(inactiveResult())
            return
        }

        activity.runOnUiThread {
            removeSessionOverlay(session)

            val root = activity.window.decorView as? ViewGroup
            val webView = bridge.webView
            if (root == null || webView == null || !pointerDown) {
                call.resolve(inactiveResult())
                return@runOnUiThread
            }

            val rootLocation = IntArray(2)
            val webLocation = IntArray(2)
            root.getLocationOnScreen(rootLocation)
            webView.getLocationOnScreen(webLocation)
            val webOffsetX = (webLocation[0] - rootLocation[0]).toFloat()
            val webOffsetY = (webLocation[1] - rootLocation[1]).toFloat()

            val widthPx = (width.toFloat() * scale).roundToInt().coerceIn(1, max(1, root.width))
            val heightPx = (height.toFloat() * scale).roundToInt().coerceIn(1, max(1, root.height))
            val originX = webOffsetX + x.toFloat() * scale
            val originY = webOffsetY + y.toFloat() * scale
            val gutterPx = gutter * scale
            val minX = webOffsetX + gutterPx
            val minY = webOffsetY + gutterPx
            val viewportRight = min(root.width.toFloat(), webOffsetX + viewportWidth.toFloat() * scale)
            val viewportBottom = min(root.height.toFloat(), webOffsetY + viewportHeight.toFloat() * scale)
            val maxX = max(minX, viewportRight - widthPx - gutterPx)
            val maxY = max(minY, viewportBottom - heightPx - gutterPx)

            val overlay = NativeDragOverlay(activity)
            val layoutParams = FrameLayout.LayoutParams(widthPx, heightPx)
            layoutParams.leftMargin = originX.roundToInt()
            layoutParams.topMargin = originY.roundToInt()
            root.addView(overlay, layoutParams)

            val drag = DragSession(
                id = id,
                overlay = overlay,
                root = root,
                scale = scale,
                webOffsetX = webOffsetX,
                webOffsetY = webOffsetY,
                originX = originX,
                originY = originY,
                startTouchX = webOffsetX + startX.toFloat() * scale,
                startTouchY = webOffsetY + startY.toFloat() * scale,
                minX = minX,
                minY = minY,
                maxX = maxX,
                maxY = maxY,
                pendingX = originX,
                pendingY = originY
            )
            session = drag
            updatePendingPosition(drag, latestTouchX, latestTouchY)

            val result = JSObject()
            result.put("active", true)
            result.put("id", id)
            call.resolve(result)
        }
    }

    @PluginMethod
    fun completeDrag(call: PluginCall) {
        finishFromJavaScript(call)
    }

    @PluginMethod
    fun cancelDrag(call: PluginCall) {
        finishFromJavaScript(call)
    }

    private fun finishFromJavaScript(call: PluginCall) {
        val id = call.getString("id")
        activity.runOnUiThread {
            val active = session
            if (active != null && active.id == id) {
                removeSessionOverlay(active)
                session = null
            }
            call.resolve()
        }
    }

    private fun handleActivityTouchEvent(event: MotionEvent) {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                activePointerId = event.getPointerId(event.actionIndex)
                latestTouchX = event.getX(event.actionIndex)
                latestTouchY = event.getY(event.actionIndex)
                pointerDown = true
            }
            MotionEvent.ACTION_MOVE -> {
                val pointerIndex = event.findPointerIndex(activePointerId)
                if (pointerIndex < 0) return
                latestTouchX = event.getX(pointerIndex)
                latestTouchY = event.getY(pointerIndex)
                session?.let {
                    if (!it.ended) updatePendingPosition(it, latestTouchX, latestTouchY)
                }
            }
            MotionEvent.ACTION_UP -> {
                latestTouchX = event.getX(event.actionIndex)
                latestTouchY = event.getY(event.actionIndex)
                pointerDown = false
                activePointerId = MotionEvent.INVALID_POINTER_ID
                session?.let { updatePendingPosition(it, latestTouchX, latestTouchY) }
                session?.let { endNativeDrag(it, cancelled = false) }
            }
            MotionEvent.ACTION_CANCEL -> {
                pointerDown = false
                activePointerId = MotionEvent.INVALID_POINTER_ID
                session?.let { endNativeDrag(it, cancelled = true) }
            }
            MotionEvent.ACTION_POINTER_UP -> {
                if (event.getPointerId(event.actionIndex) != activePointerId) return
                latestTouchX = event.getX(event.actionIndex)
                latestTouchY = event.getY(event.actionIndex)
                pointerDown = false
                activePointerId = MotionEvent.INVALID_POINTER_ID
                session?.let { updatePendingPosition(it, latestTouchX, latestTouchY) }
                session?.let { endNativeDrag(it, cancelled = false) }
            }
        }
    }

    private fun updatePendingPosition(drag: DragSession, touchX: Float, touchY: Float) {
        drag.pendingX = clamp(drag.originX + touchX - drag.startTouchX, drag.minX, drag.maxX)
        drag.pendingY = clamp(drag.originY + touchY - drag.startTouchY, drag.minY, drag.maxY)
        if (drag.frameScheduled) return

        drag.frameScheduled = true
        Choreographer.getInstance().postFrameCallback {
            drag.frameScheduled = false
            if (session !== drag || drag.ended) return@postFrameCallback
            drag.overlay.translationX = drag.pendingX - drag.originX
            drag.overlay.translationY = drag.pendingY - drag.originY
        }
    }

    private fun endNativeDrag(drag: DragSession, cancelled: Boolean) {
        if (session !== drag || drag.ended) return
        drag.ended = true
        drag.overlay.translationX = drag.pendingX - drag.originX
        drag.overlay.translationY = drag.pendingY - drag.originY

        val result = JSObject()
        result.put("id", drag.id)
        result.put("x", (drag.pendingX - drag.webOffsetX) / drag.scale)
        result.put("y", (drag.pendingY - drag.webOffsetY) / drag.scale)
        result.put("cancelled", cancelled)
        notifyListeners("dragEnd", result)

        drag.overlay.postDelayed({
            if (session === drag) {
                removeSessionOverlay(drag)
                session = null
            }
        }, 750L)
    }

    private fun removeSessionOverlay(drag: DragSession?) {
        if (drag == null) return
        if (drag.overlay.parent === drag.root) {
            drag.root.removeView(drag.overlay)
        }
    }

    override fun handleOnDestroy() {
        activity.runOnUiThread {
            removeSessionOverlay(session)
            session = null
        }
        if (activePlugin.get() === this) {
            activePlugin.clear()
        }
        super.handleOnDestroy()
    }

    private fun inactiveResult(): JSObject {
        val result = JSObject()
        result.put("active", false)
        return result
    }

    private fun clamp(value: Float, minimum: Float, maximum: Float): Float {
        return min(maximum, max(minimum, value))
    }
}

private class NativeDragOverlay(context: android.content.Context) : View(context) {
    private val backgroundPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(12, 12, 13)
        style = Paint.Style.FILL
    }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(58, 255, 255, 255)
        style = Paint.Style.STROKE
        strokeWidth = resources.displayMetrics.density
    }
    private val handlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(100, 255, 255, 255)
        style = Paint.Style.FILL
    }
    private val bounds = RectF()

    init {
        isClickable = false
        isFocusable = false
        setLayerType(LAYER_TYPE_HARDWARE, null)
        alpha = 0.96f
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val density = resources.displayMetrics.density
        val radius = 16f * density
        val inset = borderPaint.strokeWidth / 2f
        bounds.set(inset, inset, width - inset, height - inset)
        canvas.drawRoundRect(bounds, radius, radius, backgroundPaint)
        canvas.drawRoundRect(bounds, radius, radius, borderPaint)

        val handleWidth = min(width * 0.28f, 40f * density)
        val handleHeight = 4f * density
        val handleLeft = (width - handleWidth) / 2f
        val handleTop = 7f * density
        canvas.drawRoundRect(
            handleLeft,
            handleTop,
            handleLeft + handleWidth,
            handleTop + handleHeight,
            handleHeight / 2f,
            handleHeight / 2f,
            handlePaint
        )
    }
}
