package com.coursenav;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;




public class MainActivity extends Activity {
    public static final String CHANNEL_ID = "course_deadline";
    private static final int REQ_FILE = 1001;
    private static final int REQ_NOTIFY = 1002;
    private static final int REQ_IMAGE = 1003;
    private static final int REQ_PDF = 1004;
    private static final int REQ_STORAGE = 1005;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFFF4F5FA);
        web = new WebView(this);
        web.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        configureWeb();
        root.addView(web);
        setContentView(root);
        createChannel();
        maybeRequestStoragePermission();
        String open = getIntent() == null ? null : getIntent().getStringExtra("open");
        web.loadUrl("file:///android_asset/www/index.html" + ("todos".equals(open) ? "#/todos" : ("home".equals(open) ? "#/home" : "")));
    }

    private void configureWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 26) {
            s.setSafeBrowsingEnabled(true);
        }
        web.setBackgroundColor(0xFFF4F5FA);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleUrl(req.getUrl().toString());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    toast("没有找到文件选择器");
                    return false;
                }
                return true;
            }
        });
    }

    private boolean handleUrl(String url) {
        if (url == null) return true;
        if (url.startsWith("file:///android_asset/")) return false;
        try {
            if (url.startsWith("http://") || url.startsWith("https://")) {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } else {
                Intent i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(i);
            }
        } catch (Exception e) {
            toast("打不开这个入口，可长按复制");
        }
        return true;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "课程截止与上课提醒",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("作业截止与上课时间提醒");
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
    }

    private void notifyJs(final String fn, final String payload) {
        runOnUiThread(() -> {
            if (web == null) return;
            String js = "window.NativeCB && window.NativeCB." + fn + "(" +
                    JSONObject.quote(payload) + ")";
            web.evaluateJavascript(js, null);
        });
    }

    public void toast(final String msg) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_IMAGE) {
            if (res != RESULT_OK || data == null || data.getData() == null) return;
            final Uri uri = data.getData();
            // 读取、解码、压缩放工作线程，避免主线程 ANR
            new Thread(() -> {
                try {
                    JSONObject o = readImage(uri);
                    notifyJs("onImagePicked", o.toString());
                } catch (Exception e) {
                    toast("读取图片失败：" + e.getMessage());
                    notifyJs("onImagePicked", "{\"error\":true}");
                }
            }).start();
            return;
        }
        if (req == REQ_PDF) {
            if (res != RESULT_OK || data == null || data.getData() == null) return;
            final Uri uri = data.getData();
            new Thread(() -> {
                try {
                    JSONObject o = readPdf(uri);
                    notifyJs("onPdfPicked", o.toString());
                } catch (Exception e) {
                    toast("读取 PDF 失败：" + e.getMessage());
                    notifyJs("onPdfPicked", "{\"error\":true}");
                }
            }).start();
            return;
        }
        if (req == REQ_FILE) {
            final Uri uri = (res == RESULT_OK && data != null && data.getData() != null) ? data.getData() : null;
            if (uri == null) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = null;
                return;
            }
            new Thread(() -> {
                String payload;
                try {
                    InputStream in = getContentResolver().openInputStream(uri);
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n, total = 0;
                    while ((n = in.read(buf)) > 0) {
                        total += n;
                        if (total > 3 * 1024 * 1024) throw new Exception("文件超过 3MB");
                        bo.write(buf, 0, n);
                    }
                    in.close();
                    JSONObject o = new JSONObject();
                    o.put("name", queryName(uri));
                    o.put("text", bo.toString("UTF-8"));
                    payload = o.toString();
                } catch (Exception e) {
                    toast("读取文件失败：" + e.getMessage());
                    payload = "{\"error\":true}";
                }
                final String pl = payload;
                runOnUiThread(() -> {
                    notifyJs("onFilePicked", pl);
                    if (fileCallback != null) fileCallback.onReceiveValue(new Uri[]{uri});
                    fileCallback = null;
                });
            }).start();
        }
    }

    private JSONObject readPdf(Uri uri) throws Exception {
        InputStream in = getContentResolver().openInputStream(uri);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n, total = 0;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > 20 * 1024 * 1024) throw new Exception("PDF 超过 20MB");
            bo.write(buf, 0, n);
        }
        in.close();
        JSONObject o = new JSONObject();
        o.put("name", queryName(uri));
        o.put("dataUrl", "data:application/pdf;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP));
        return o;
    }

    private JSONObject readImage(Uri uri) throws Exception {
        InputStream in = getContentResolver().openInputStream(uri);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n, total = 0;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > 12 * 1024 * 1024) throw new Exception("图片超过 12MB");
            bo.write(buf, 0, n);
        }
        in.close();
        byte[] raw = bo.toByteArray();
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(raw, 0, raw.length, bounds);
        int sample = 1;
        while (bounds.outWidth / sample > 3000 || bounds.outHeight / sample > 3000) sample *= 2;
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = sample;
        Bitmap bmp = BitmapFactory.decodeByteArray(raw, 0, raw.length, opts);
        if (bmp == null) throw new Exception("图片解码失败");
        int w = bmp.getWidth(), h = bmp.getHeight();
        if (Math.max(w, h) > 2200) {
            float scale = 2200f / Math.max(w, h);
            bmp = Bitmap.createScaledBitmap(bmp, Math.round(w * scale), Math.round(h * scale), true);
        }
        ByteArrayOutputStream jpg = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 78, jpg);
        String b64 = Base64.encodeToString(jpg.toByteArray(), Base64.NO_WRAP);
        JSONObject o = new JSONObject();
        o.put("name", queryName(uri));
        o.put("path", queryMediaPath(uri));
        o.put("dataUrl", "data:image/jpeg;base64," + b64);
        o.put("width", bmp.getWidth());
        o.put("height", bmp.getHeight());
        bmp.recycle();
        return o;
    }

    private String queryMediaPath(Uri uri) {
        try (android.database.Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex("relative_path");
                if (idx >= 0 && c.getString(idx) != null) return c.getString(idx);
            }
        } catch (Exception ignored) {}
        String p = uri.getPath();
        return p == null ? "" : p;
    }

    private String queryName(Uri uri) {
        String name = "import.txt";
        try (android.database.Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) name = c.getString(idx);
            }
        } catch (Exception ignored) {}
        return name;
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req == REQ_NOTIFY) {
            boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            notifyJs("onNotifyPermission", ok ? "true" : "false");
        }
        if (req == REQ_STORAGE) {
            boolean ok = res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED;
            if (!ok) toast("未授予存储权限，导出备份/日志可能失败");
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (web != null && intent != null) {
            String open = intent.getStringExtra("open");
            if ("todos".equals(open) || "home".equals(open)) {
                web.evaluateJavascript("location.hash='#/" + open + "'", null);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    public class Bridge {
        @JavascriptInterface
        public String info() {
            try {
                JSONObject o = new JSONObject();
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
                o.put("app", "1.8.0");
                o.put("notifyGranted", hasNotifyPermission());
                o.put("exactAlarm", canExact());
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void setNight(final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    int bg = dark ? 0xFF0F1117 : 0xFFF4F5FA;
                    getWindow().setStatusBarColor(bg);
                    getWindow().setNavigationBarColor(bg);
                    if (web != null) web.setBackgroundColor(bg);
                    View dv = getWindow().getDecorView();
                    int flags = dv.getSystemUiVisibility();
                    if (dark) {
                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        if (Build.VERSION.SDK_INT >= 26) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    } else {
                        flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        if (Build.VERSION.SDK_INT >= 26) flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                    dv.setSystemUiVisibility(flags);
                    if (Build.VERSION.SDK_INT >= 30) {
                        int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                        getWindow().getInsetsController().setSystemBarsAppearance(dark ? 0 : mask, mask);
                    }
                }
            });
        }

        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("课程入口", text));
            // 复制反馈交给 Android 系统剪贴板提示，避免应用 Toast 与系统提示重叠
        }

        @JavascriptInterface
        public boolean open(String url) {
            if (url == null || url.trim().isEmpty()) return false;
            final String u = url.trim();
            try {
                Intent i;
                if (u.startsWith("http://") || u.startsWith("https://")) {
                    i = new Intent(Intent.ACTION_VIEW, Uri.parse(u));
                    i.addCategory(Intent.CATEGORY_BROWSABLE);
                } else if (u.startsWith("package:")) {
                    Intent li = getPackageManager().getLaunchIntentForPackage(u.substring(8));
                    if (li == null) return false;
                    i = li;
                } else if (u.startsWith("intent:")) {
                    i = Intent.parseUri(u, Intent.URI_INTENT_SCHEME);
                    i.addCategory(Intent.CATEGORY_BROWSABLE);
                } else {
                    i = new Intent(Intent.ACTION_VIEW, Uri.parse(u));
                }
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void share(String text) {
            try {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "分享"));
            } catch (Exception e) {
                toast("分享失败");
            }
        }

        @JavascriptInterface
        public String save(String name, String content, String mime) {
            try {
                String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS + "/DSH-Go");
                    Uri uri = getContentResolver().insert(
                            MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    if (uri == null) throw new Exception("无法创建文件");
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(content.getBytes(StandardCharsets.UTF_8));
                    os.close();
                    return "Download/DSH-Go/" + safe;
                } else {
                    File dir = new File(Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS), "DSH-Go");
                    if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法创建目录");
                    File f = new File(dir, safe);
                    FileOutputStream fo = new FileOutputStream(f);
                    fo.write(content.getBytes(StandardCharsets.UTF_8));
                    fo.close();
                    return f.getAbsolutePath();
                }
            } catch (Exception e) {
                return "ERR:" + e.getMessage();
            }
        }

        @JavascriptInterface
        public void pickFile() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_FILE);
                } catch (Exception e) {
                    toast("没有找到文件选择器");
                }
            });
        }

        @JavascriptInterface
        public void pickPdf() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/pdf");
                try {
                    startActivityForResult(i, REQ_PDF);
                } catch (Exception e) {
                    toast("没有找到 PDF 选择器");
                }
            });
        }

        @JavascriptInterface
        public void pickImage() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/*");
                try {
                    startActivityForResult(i, REQ_IMAGE);
                } catch (Exception e) {
                    toast("没有找到图片选择器");
                }
            });
        }

        @JavascriptInterface
        public void ocr(final String base64, final String mime, final String endpoint,
                        final String key, final String lang) {
            new Thread(() -> {
                JSONObject out = new JSONObject();
                HttpURLConnection conn = null;
                try {
                    if (endpoint == null || !endpoint.startsWith("https://"))
                        throw new Exception("OCR 接口必须是 https://");
                    if (base64 == null || base64.length() < 100) throw new Exception("图片内容为空");
                    String body = "base64Image=" + URLEncoder.encode("data:" +
                            (mime == null || mime.isEmpty() ? "image/jpeg" : mime) + ";base64," + base64, "UTF-8") +
                            "&language=" + URLEncoder.encode(lang == null || lang.isEmpty() ? "chs" : lang, "UTF-8") +
                            "&OCREngine=2&scale=true&isOverlayRequired=true&isTable=true&filetype=JPG";
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    conn = (HttpURLConnection) new URL(endpoint).openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(45000);
                    conn.setDoOutput(true);
                    conn.setFixedLengthStreamingMode(bytes.length);
                    conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
                    if (key != null && !key.isEmpty()) conn.setRequestProperty("apikey", key);
                    OutputStream os = conn.getOutputStream();
                    os.write(bytes);
                    os.close();
                    int code = conn.getResponseCode();
                    InputStream is = code >= 200 && code < 400 ? conn.getInputStream() : conn.getErrorStream();
                    BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    br.close();
                    String resp = sb.toString();
                    if (code < 200 || code >= 400) {
                        out.put("ok", false);
                        out.put("error", "OCR 接口返回 HTTP " + code + "：" + resp.substring(0, Math.min(160, resp.length())));
                    } else {
                        JSONObject j = new JSONObject(resp);
                        StringBuilder text = new StringBuilder();
                        if (j.optBoolean("IsErroredOnProcessing")) {
                            out.put("ok", false);
                            out.put("error", String.valueOf(j.opt("ErrorMessage")));
                        } else {
                            JSONArray arr = j.optJSONArray("ParsedResults");
                            if (arr != null) for (int i = 0; i < arr.length(); i++) {
                                JSONObject r = arr.optJSONObject(i);
                                if (r != null) {
                                    String t = r.optString("ParsedText", "");
                                    if (!t.isEmpty()) text.append(t).append("\n");
                                }
                            }
                            String result = text.toString().trim();
                            out.put("ok", !result.isEmpty());
                            out.put("text", result);
                            out.put("service", "OCR.space");
                            JSONObject overlay = new JSONObject();
                            JSONArray olines = new JSONArray();
                            if (arr != null && arr.length() > 0) {
                                JSONObject pr = arr.optJSONObject(0);
                                JSONObject to = pr == null ? null : pr.optJSONObject("TextOverlay");
                                JSONArray ls = to == null ? null : to.optJSONArray("Lines");
                                if (ls != null) for (int i = 0; i < ls.length(); i++) {
                                    JSONObject ln = ls.optJSONObject(i);
                                    if (ln == null) continue;
                                    JSONArray ws = ln.optJSONArray("Words");
                                    if (ws == null || ws.length() == 0) continue;
                                    double left = Double.MAX_VALUE, top = Double.MAX_VALUE;
                                    double right = 0, bottom = 0;
                                    for (int k = 0; k < ws.length(); k++) {
                                        JSONObject w = ws.optJSONObject(k);
                                        if (w == null) continue;
                                        double l = w.optDouble("Left"), t = w.optDouble("Top");
                                        double ww = w.optDouble("Width"), hh = w.optDouble("Height");
                                        left = Math.min(left, l); top = Math.min(top, t);
                                        right = Math.max(right, l + ww); bottom = Math.max(bottom, t + hh);
                                    }
                                    if (right <= left || bottom <= top) continue;
                                    JSONObject o2 = new JSONObject();
                                    o2.put("text", ln.optString("LineText", ""));
                                    o2.put("left", left); o2.put("top", top);
                                    o2.put("width", right - left); o2.put("height", bottom - top);
                                    olines.put(o2);
                                }
                            }
                            overlay.put("lines", olines);
                            out.put("overlay", overlay);
                            if (result.isEmpty()) out.put("error", "没有识别到文字，换一张更清晰的截图试试");
                        }
                    }
                } catch (Exception e) {
                    try {
                        out.put("ok", false);
                        out.put("error", e.getMessage() == null ? "OCR 请求失败" : e.getMessage());
                    } catch (Exception ignored) {}
                } finally {
                    if (conn != null) conn.disconnect();
                }
                notifyJs("onOcrResult", out.toString());
            }).start();
        }

        @JavascriptInterface
        public void requestNotifyPermission() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && !hasNotifyPermission()) {
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
                } else {
                    notifyJs("onNotifyPermission", "true");
                }
            });
        }

        @JavascriptInterface
        public void notifyAt(String id, String title, String text, long at) {
            if (at < System.currentTimeMillis() + 1000) return;
            schedule(MainActivity.this, id, title, text, at);
            storeAlarm(MainActivity.this, id, title, text, at, true);
        }

        @JavascriptInterface
        public void cancel(String id) {
            cancelAlarm(MainActivity.this, id);
            storeAlarm(MainActivity.this, id, "", "", 0, false);
        }

        @JavascriptInterface
        public void notifyNow(String id, String title, String text) {
            AlarmReceiver.show(MainActivity.this, id, title, text);
        }

        @JavascriptInterface
        public String alarms() {
            SharedPreferences sp = getSharedPreferences("cnav", MODE_PRIVATE);
            return sp.getString("alarms", "[]");
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> finish());
        }

        @JavascriptInterface
        public void httpPost(final String url, final String key, final String body) {
            if (url == null || !url.startsWith("https://")) {
                notifyJs("onHttpResult", "{\"ok\":false,\"error\":\"接口必须是 https://\"}");
                return;
            }
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(15000);
                    conn.setReadTimeout(60000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    if (key != null && !key.isEmpty()) {
                        conn.setRequestProperty("Authorization", "Bearer " + key);
                    }
                    OutputStream os = conn.getOutputStream();
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                    os.close();
                    int code = conn.getResponseCode();
                    InputStream in = (code >= 200 && code < 300)
                            ? conn.getInputStream() : conn.getErrorStream();
                    StringBuilder sb = new StringBuilder();
                    if (in != null) {
                        BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                        String line;
                        while ((line = br.readLine()) != null) sb.append(line);
                        br.close();
                    }
                    JSONObject out = new JSONObject();
                    out.put("ok", code >= 200 && code < 300);
                    out.put("status", code);
                    out.put("body", sb.toString());
                    notifyJs("onHttpResult", out.toString());
                } catch (Exception e) {
                    try {
                        JSONObject out = new JSONObject();
                        out.put("ok", false);
                        out.put("error", e.getMessage() == null ? e.toString() : e.getMessage());
                        notifyJs("onHttpResult", out.toString());
                    } catch (Exception ignored) {}
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }).start();
        }
    }

    private void maybeRequestStoragePermission() {
        // Android 6.0–9.0 直接写公共 Download 目录需要运行时授权；API 29+ 走 MediaStore 无需权限
        if (Build.VERSION.SDK_INT >= 23 && Build.VERSION.SDK_INT <= 28
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
        }
    }

    private boolean hasNotifyPermission() {
        if (Build.VERSION.SDK_INT < 33) return true;
        return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean canExact() {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        return am.canScheduleExactAlarms();
    }

    private static PendingIntent intentFor(Context ctx, String id, String title, String text, long at) {
        Intent i = new Intent(ctx, AlarmReceiver.class);
        i.putExtra("id", id);
        i.putExtra("title", title);
        i.putExtra("text", text);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, id.hashCode(), i, flags);
    }

    public static void schedule(Context ctx, String id, String title, String text, long at) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = intentFor(ctx, id, title, text, at);
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setWindow(AlarmManager.RTC_WAKEUP, at, 10 * 60 * 1000L, pi);
            } else if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (SecurityException e) {
            am.setWindow(AlarmManager.RTC_WAKEUP, at, 10 * 60 * 1000L, pi);
        }
    }

    public static void cancelAlarm(Context ctx, String id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        am.cancel(intentFor(ctx, id, "", "", 0));
    }

    private static synchronized void storeAlarm(Context ctx, String id, String title,
                                               String text, long at, boolean add) {
        SharedPreferences sp = ctx.getSharedPreferences("cnav", MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(sp.getString("alarms", "[]"));
            JSONArray out = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (!id.equals(o.optString("id"))) out.put(o);
            }
            if (add) {
                JSONObject o = new JSONObject();
                o.put("id", id);
                o.put("title", title);
                o.put("text", text);
                o.put("at", at);
                out.put(o);
            }
            sp.edit().putString("alarms", out.toString()).apply();
        } catch (Exception ignored) {}
    }
}
