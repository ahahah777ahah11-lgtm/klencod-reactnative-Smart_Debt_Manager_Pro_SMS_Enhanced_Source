package com.example

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import com.example.ui.theme.MyApplicationTheme
import java.io.File
import java.io.FileOutputStream

class MainActivity : ComponentActivity() {

  private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
  private var currentWebView: WebView? = null

  private val fileChooserLauncher =
      registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
          val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
          fileChooserCallback?.onReceiveValue(uris)
        } else {
          fileChooserCallback?.onReceiveValue(null)
        }
        fileChooserCallback = null
      }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()

    setContent {
      MyApplicationTheme {
        var canGoBack by remember { mutableStateOf(false) }

        BackHandler(enabled = canGoBack) {
          currentWebView?.let { webView ->
            if (webView.canGoBack()) {
              webView.goBack()
            }
          }
        }

        Surface(
            modifier = Modifier.fillMaxSize().systemBarsPadding(),
            color = Color(0xFF103B59)
        ) {
          DebtManagerWebView(
              onWebViewCreated = { webView ->
                currentWebView = webView
              },
              onCanGoBackChanged = { canBack ->
                canGoBack = canBack
              },
              onShowFileChooser = { filePathCallback, fileChooserParams ->
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                try {
                  val intent = fileChooserParams?.createIntent()
                      ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "*/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                      }
                  fileChooserLauncher.launch(intent)
                } catch (e: Exception) {
                  fileChooserCallback?.onReceiveValue(null)
                  fileChooserCallback = null
                }
              }
          )
        }
      }
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  @Composable
  private fun DebtManagerWebView(
      onWebViewCreated: (WebView) -> Unit,
      onCanGoBackChanged: (Boolean) -> Unit,
      onShowFileChooser: (ValueCallback<Array<Uri>>, WebChromeClient.FileChooserParams?) -> Unit
  ) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
          WebView(context).apply {
            onWebViewCreated(this)

            settings.apply {
              javaScriptEnabled = true
              domStorageEnabled = true
              databaseEnabled = true
              allowFileAccess = true
              allowContentAccess = true
              loadWithOverviewMode = true
              useWideViewPort = true
              cacheMode = WebSettings.LOAD_DEFAULT
              displayZoomControls = false
              builtInZoomControls = false
              textZoom = 100
              layoutAlgorithm = WebSettings.LayoutAlgorithm.NORMAL
            }

            setBackgroundColor(android.graphics.Color.parseColor("#103B59"))

            addJavascriptInterface(
                AndroidNativeBridge(context),
                "AndroidNativeBridge"
            )

            webViewClient = object : WebViewClient() {
              override fun shouldOverrideUrlLoading(
                  view: WebView?,
                  request: WebResourceRequest?
              ): Boolean {
                val url = request?.url?.toString() ?: return false
                return handleSpecialUrl(context, url)
              }

              @Deprecated("Deprecated in Java")
              override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                if (url == null) return false
                return handleSpecialUrl(context, url)
              }

              override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                onCanGoBackChanged(canGoBack())
              }
            }

            webChromeClient = object : WebChromeClient() {
              override fun onShowFileChooser(
                  webView: WebView?,
                  filePathCallback: ValueCallback<Array<Uri>>?,
                  fileChooserParams: FileChooserParams?
              ): Boolean {
                if (filePathCallback != null) {
                  onShowFileChooser(filePathCallback, fileChooserParams)
                  return true
                }
                return false
              }
            }

            loadUrl("file:///android_asset/smart-debt/index.html")
          }
        }
    )
  }

  private fun handleSpecialUrl(context: Context, url: String): Boolean {
    try {
      when {
        url.startsWith("sms:") || url.startsWith("smsto:") -> {
          val intent = Intent(Intent.ACTION_SENDTO, Uri.parse(url))
          context.startActivity(intent)
          return true
        }
        url.startsWith("tel:") -> {
          val intent = Intent(Intent.ACTION_DIAL, Uri.parse(url))
          context.startActivity(intent)
          return true
        }
        url.startsWith("mailto:") -> {
          val intent = Intent(Intent.ACTION_SENDTO, Uri.parse(url))
          context.startActivity(intent)
          return true
        }
      }
    } catch (e: Exception) {
      Toast.makeText(context, "تعذر فتح التطبيق المطلوب: ${e.message}", Toast.LENGTH_SHORT).show()
      return true
    }
    return false
  }

  inner class AndroidNativeBridge(private val context: Context) {

    @JavascriptInterface
    fun isAndroidApp(): Boolean = true

    @JavascriptInterface
    fun openSmsApp(phoneNumber: String, messageText: String) {
      try {
        val cleanPhone = phoneNumber.replace(Regex("[^0-9+]"), "")
        val intent = Intent(Intent.ACTION_SENDTO).apply {
          data = Uri.parse("smsto:$cleanPhone")
          putExtra("sms_body", messageText)
          putExtra(Intent.EXTRA_TEXT, messageText)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      } catch (e: Exception) {
        runOnUiThread {
          Toast.makeText(context, "تعذر فتح تطبيق الرسائل: ${e.message}", Toast.LENGTH_LONG).show()
        }
      }
    }

    @JavascriptInterface
    fun shareText(title: String, content: String) {
      try {
        val intent = Intent(Intent.ACTION_SEND).apply {
          type = "text/plain"
          putExtra(Intent.EXTRA_SUBJECT, title)
          putExtra(Intent.EXTRA_TEXT, content)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val chooser = Intent.createChooser(intent, title).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
      } catch (e: Exception) {
        runOnUiThread {
          Toast.makeText(context, "تعذر مشاركة النص: ${e.message}", Toast.LENGTH_SHORT).show()
        }
      }
    }

    @JavascriptInterface
    fun saveFile(fileName: String, base64Data: String, mimeType: String) {
      try {
        val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
        val cacheDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(cacheDir, fileName)
        FileOutputStream(file).use { it.write(decodedBytes) }

        val uri: Uri = try {
          FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        } catch (e: Exception) {
          Uri.fromFile(file)
        }

        val shareIntent = Intent(Intent.ACTION_SEND).apply {
          type = mimeType
          putExtra(Intent.EXTRA_STREAM, uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val chooser = Intent.createChooser(shareIntent, "مشاركة / حفظ الملف").apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
      } catch (e: Exception) {
        runOnUiThread {
          Toast.makeText(context, "فشل حفظ الملف: ${e.message}", Toast.LENGTH_LONG).show()
        }
      }
    }

    @JavascriptInterface
    fun scheduleCalendarReminder(
        title: String,
        description: String,
        dueDateIso: String,
        amount: Double,
        currency: String,
        customerName: String
    ): Boolean {
      try {
        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
        val date = try {
          sdf.parse(dueDateIso)
        } catch (_: Exception) {
          null
        }
        val cal = java.util.Calendar.getInstance()
        if (date != null) {
          cal.time = date
          cal.set(java.util.Calendar.HOUR_OF_DAY, 9)
          cal.set(java.util.Calendar.MINUTE, 0)
          cal.set(java.util.Calendar.SECOND, 0)
        } else {
          cal.add(java.util.Calendar.DAY_OF_YEAR, 1)
          cal.set(java.util.Calendar.HOUR_OF_DAY, 9)
          cal.set(java.util.Calendar.MINUTE, 0)
        }
        val startTime = cal.timeInMillis
        val endTime = startTime + (60 * 60 * 1000)

        val eventTitle = if (title.isNotEmpty()) title else "سداد دين: $customerName"
        val eventDesc = if (description.isNotEmpty()) {
          "$description\nالعميل: $customerName\nالمبلغ المستحق: $amount $currency\nتطبيق مدير الديون الذكي برو SMS"
        } else {
          "تذكير بموعد استحقاق سداد دين للعميل $customerName بمبلغ $amount $currency.\nتطبيق مدير الديون الذكي برو SMS"
        }

        val intent = Intent(Intent.ACTION_INSERT).apply {
          data = android.provider.CalendarContract.Events.CONTENT_URI
          putExtra(android.provider.CalendarContract.Events.TITLE, eventTitle)
          putExtra(android.provider.CalendarContract.Events.DESCRIPTION, eventDesc)
          putExtra(android.provider.CalendarContract.EXTRA_EVENT_BEGIN_TIME, startTime)
          putExtra(android.provider.CalendarContract.EXTRA_EVENT_END_TIME, endTime)
          putExtra(android.provider.CalendarContract.Events.ALL_DAY, false)
          putExtra(android.provider.CalendarContract.Events.HAS_ALARM, 1)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        return true
      } catch (e: Exception) {
        runOnUiThread {
          Toast.makeText(context, "تعذر فتح تقويم الهاتف: ${e.message}", Toast.LENGTH_SHORT).show()
        }
        return false
      }
    }

    @JavascriptInterface
    fun vibrate() {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
          vibratorManager?.defaultVibrator?.vibrate(VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
          @Suppress("DEPRECATION")
          val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
          @Suppress("DEPRECATION")
          vibrator?.vibrate(30)
        }
      } catch (_: Exception) {}
    }

    @JavascriptInterface
    fun extractSqliteDatabase(base64Data: String): String {
      val result = org.json.JSONObject()
      var temp: File? = null
      var database: android.database.sqlite.SQLiteDatabase? = null
      try {
        require(base64Data.length <= 110_000_000) { "حجم قاعدة البيانات أكبر من الحد المسموح للتحليل الآمن." }
        val bytes = Base64.decode(base64Data, Base64.DEFAULT)
        val sourceHash = java.security.MessageDigest.getInstance("SHA-256").digest(bytes)
          .joinToString("") { "%02x".format(it) }
        require(bytes.size >= 100 && String(bytes, 0, 16, Charsets.US_ASCII).startsWith("SQLite format 3")) {
          "الملف ليس قاعدة SQLite صالحة."
        }
        temp = File.createTempFile("readonly_import_", ".db", context.cacheDir)
        FileOutputStream(temp).use { it.write(bytes) }
        val db = android.database.sqlite.SQLiteDatabase.openDatabase(
          temp.absolutePath, null, android.database.sqlite.SQLiteDatabase.OPEN_READONLY
        )
        database = db

        val tables = org.json.JSONArray()
        val tableNames = mutableListOf<String>()
        db.rawQuery(
          "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", null
        ).use { c ->
          while (c.moveToNext()) {
            val tableName = c.getString(0) ?: continue
            tableNames.add(tableName)
            val table = org.json.JSONObject()
            table.put("name", tableName)
            table.put("sql", if (c.isNull(1)) "" else c.getString(1))

            val columns = org.json.JSONArray()
            db.rawQuery("PRAGMA table_info(${quoteIdentifier(tableName)})", null).use { info ->
              while (info.moveToNext()) {
                columns.put(org.json.JSONObject().apply {
                  put("cid", info.getInt(0)); put("name", info.getString(1) ?: "")
                  put("type", info.getString(2) ?: ""); put("notNull", info.getInt(3) != 0)
                  put("defaultValue", if (info.isNull(4)) org.json.JSONObject.NULL else info.getString(4))
                  put("primaryKeyPosition", info.getInt(5))
                })
              }
            }
            table.put("columns", columns)

            val foreignKeys = org.json.JSONArray()
            db.rawQuery("PRAGMA foreign_key_list(${quoteIdentifier(tableName)})", null).use { fk ->
              while (fk.moveToNext()) {
                foreignKeys.put(org.json.JSONObject().apply {
                  put("id", fk.getInt(0)); put("seq", fk.getInt(1)); put("referencedTable", fk.getString(2) ?: "")
                  put("from", fk.getString(3) ?: ""); put("to", fk.getString(4) ?: "")
                  put("onUpdate", fk.getString(5) ?: ""); put("onDelete", fk.getString(6) ?: "")
                })
              }
            }
            table.put("foreignKeys", foreignKeys)

            val indexes = org.json.JSONArray()
            db.rawQuery("PRAGMA index_list(${quoteIdentifier(tableName)})", null).use { ix ->
              while (ix.moveToNext()) {
                val indexName = ix.getString(1) ?: ""
                val indexColumns = org.json.JSONArray()
                db.rawQuery("PRAGMA index_info(${quoteIdentifier(indexName)})", null).use { ic ->
                  while (ic.moveToNext()) indexColumns.put(ic.getString(2) ?: "")
                }
                indexes.put(org.json.JSONObject().apply {
                  put("name", indexName); put("unique", ix.getInt(2) != 0)
                  put("origin", if (ix.columnCount > 3) ix.getString(3) ?: "" else "")
                  put("columns", indexColumns)
                })
              }
            }
            table.put("indexes", indexes)

            tables.put(table)
          }
        }
        result.put("tables", tables)

        val rowsByTable = org.json.JSONObject()
        var totalRows = 0
        val maxRowsPerTable = 10000
        val maxTotalRows = 50000
        var wasTruncated = false
        for (tableName in tableNames) {
          if (totalRows >= maxTotalRows) break
          val rows = org.json.JSONArray()
          db.rawQuery("SELECT * FROM ${quoteIdentifier(tableName)} LIMIT ${minOf(maxRowsPerTable, maxTotalRows - totalRows) + 1}", null).use { c ->
            var count = 0
            while (c.moveToNext() && count < maxRowsPerTable && totalRows < maxTotalRows) {
              val row = org.json.JSONObject()
              for (i in 0 until c.columnCount) {
                val value: Any? = when (c.getType(i)) {
                  android.database.Cursor.FIELD_TYPE_NULL -> null
                  android.database.Cursor.FIELD_TYPE_INTEGER -> c.getLong(i)
                  android.database.Cursor.FIELD_TYPE_FLOAT -> c.getDouble(i)
                  android.database.Cursor.FIELD_TYPE_BLOB -> "[BLOB:${c.getBlob(i)?.size ?: 0}]"
                  else -> c.getString(i)
                }
                row.put(c.getColumnName(i), value ?: org.json.JSONObject.NULL)
              }
              rows.put(row); count++; totalRows++
            }
            if (count >= maxRowsPerTable) wasTruncated = true
          }
          rowsByTable.put(tableName, rows)
        }
        result.put("rowsByTable", rowsByTable)
        result.put("totalRowsRead", totalRows)
        result.put("truncated", wasTruncated || totalRows >= maxTotalRows)

        val integrity = org.json.JSONArray()
        db.rawQuery("PRAGMA quick_check", null).use { c -> while (c.moveToNext()) integrity.put(c.getString(0)) }
        result.put("integrityCheck", integrity)
        val fkCheck = org.json.JSONArray()
        db.rawQuery("PRAGMA foreign_key_check", null).use { c ->
          while (c.moveToNext() && fkCheck.length() < 500) {
            fkCheck.put(org.json.JSONObject().apply {
              put("table", c.getString(0)); put("rowid", if (c.isNull(1)) org.json.JSONObject.NULL else c.getLong(1))
              put("parent", c.getString(2)); put("fkid", c.getInt(3))
            })
          }
        }
        result.put("foreignKeyViolations", fkCheck)
        result.put("success", true)
        result.put("sourceHash", sourceHash)
        result.put("tableCount", tables.length())
      } catch (e: Exception) {
        result.put("success", false)
        result.put("error", e.message ?: "SQLite inspection failed")
      } finally {
        try { database?.close() } catch (_: Exception) {}
        try { temp?.delete() } catch (_: Exception) {}
      }
      return result.toString()
    }

    private fun quoteIdentifier(identifier: String): String = "\"${identifier.replace("\"", "\"\"")}\""
  }
}
