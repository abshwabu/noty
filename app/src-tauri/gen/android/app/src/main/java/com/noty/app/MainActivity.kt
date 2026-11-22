package com.noty.app

import android.content.Intent
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    handleIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleIntent(intent)
  }

  private fun handleIntent(intent: Intent?) {
    if (intent == null) return
    val action = intent.action
    val type = intent.type

    if (Intent.ACTION_SEND == action && type != null) {
      if (type.startsWith("text/")) {
        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
          ?: intent.getStringExtra(Intent.EXTRA_SUBJECT)
        if (sharedText != null) {
          dispatchWebEvent("noty:android-share", mapOf("text" to sharedText))
        }
      }
    } else if ("com.noty.app.ACTION_NEW_NOTE" == action) {
      dispatchWebEvent("noty:android-action", mapOf("action" to "new-note"))
    } else if ("com.noty.app.ACTION_DAILY_NOTE" == action) {
      dispatchWebEvent("noty:android-action", mapOf("action" to "daily-note"))
    }
  }

  private fun dispatchWebEvent(eventName: String, data: Map<String, String>) {
    val jsonPayload = org.json.JSONObject(data).toString()
    val script = "window.dispatchEvent(new CustomEvent('$eventName', { detail: $jsonPayload }));"
    
    window.decorView.postDelayed({
      try {
        val webViewField = TauriActivity::class.java.getDeclaredField("mWebView")
        webViewField.isAccessible = true
        val webView = webViewField.get(this) as? WebView
        webView?.evaluateJavascript(script, null)
      } catch (_: Exception) {}
    }, 500)
  }
}
