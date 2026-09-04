package com.offroader.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity implements LocationListener {
    private static final int LOCATION_REQ = 44;
    private WebView web;
    private LocationManager locationManager;
    private final ExecutorService net = Executors.newFixedThreadPool(4);
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("offroader", MODE_PRIVATE);
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);

        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " Offroader/0.1");

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new NativeBridge(this), "NativeBridge");
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();
        startLocationUpdates();
    }

    @Override
    protected void onPause() {
        super.onPause();
        try { locationManager.removeUpdates(this); } catch (Exception ignored) {}
    }

    private void startLocationUpdates() {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQ);
            return;
        }
        try {
            locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 2f, this, Looper.getMainLooper());
        } catch (Exception ignored) {}
        try {
            locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000, 5f, this, Looper.getMainLooper());
        } catch (Exception ignored) {}
        Location best = null;
        try { best = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER); } catch (Exception ignored) {}
        if (best == null) try { best = locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER); } catch (Exception ignored) {}
        if (best != null) onLocationChanged(best);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQ) startLocationUpdates();
    }

    @Override
    public void onLocationChanged(Location l) {
        JSONObject o = new JSONObject();
        try {
            o.put("lat", l.getLatitude());
            o.put("lon", l.getLongitude());
            o.put("accuracy", l.hasAccuracy() ? l.getAccuracy() : JSONObject.NULL);
            o.put("speedMps", l.hasSpeed() ? l.getSpeed() : 0);
            o.put("bearing", l.hasBearing() ? l.getBearing() : JSONObject.NULL);
            o.put("time", l.getTime());
        } catch (Exception ignored) {}
        final String payload = o.toString();
        web.post(() -> web.evaluateJavascript("window.onNativeLocation && window.onNativeLocation(" + JSONObject.quote(payload) + ");", null));
    }

    private String getText(String targetUrl, String userAgent) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(targetUrl).openConnection();
        c.setConnectTimeout(12000);
        c.setReadTimeout(15000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("Accept", "application/json, text/plain, */*");
        c.setRequestProperty("User-Agent", userAgent);
        int code = c.getResponseCode();
        InputStream in = code >= 200 && code < 400 ? c.getInputStream() : c.getErrorStream();
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        StringBuilder b = new StringBuilder();
        String line;
        while ((line = r.readLine()) != null) b.append(line).append('\n');
        if (code < 200 || code >= 400) throw new RuntimeException("HTTP " + code + ": " + b);
        return b.toString();
    }

    private void callback(String id, boolean ok, String body) {
        web.post(() -> web.evaluateJavascript(
                "window.__nativeCallback && window.__nativeCallback(" + JSONObject.quote(id) + "," + (ok ? "true" : "false") + "," + JSONObject.quote(body) + ");", null));
    }

    public class NativeBridge {
        private final Context context;
        NativeBridge(Context context) { this.context = context; }

        @JavascriptInterface
        public void requestLocation() { runOnUiThread(() -> startLocationUpdates()); }

        @JavascriptInterface
        public void openLocationSettings() {
            runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)));
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) {}
            });
        }

        @JavascriptInterface
        public String getMapboxToken() { return prefs.getString("mapbox_token", ""); }

        @JavascriptInterface
        public void setMapboxToken(String token) {
            prefs.edit().putString("mapbox_token", token == null ? "" : token.trim()).apply();
        }

        @JavascriptInterface
        public void geocodeUS(String query, String callbackId) {
            net.submit(() -> {
                try {
                    String q = URLEncoder.encode(query, StandardCharsets.UTF_8.name());
                    String url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=us&q=" + q;
                    callback(callbackId, true, getText(url, "Offroader/0.1 (Android prototype; Nominatim low-volume use)"));
                } catch (Exception e) { callback(callbackId, false, e.toString()); }
            });
        }

        @JavascriptInterface
        public void route(double startLat, double startLon, double endLat, double endLon, boolean traffic, String callbackId) {
            net.submit(() -> {
                try {
                    String token = prefs.getString("mapbox_token", "").trim();
                    if (traffic && !token.isEmpty()) {
                        String coords = String.format(Locale.US, "%f,%f;%f,%f", startLon, startLat, endLon, endLat);
                        String url = "https://api.mapbox.com/directions/v5/mapbox/driving-traffic/" + coords +
                                "?alternatives=true&geometries=geojson&overview=full&steps=true&banner_instructions=true&voice_instructions=false&annotations=congestion,closure,maxspeed&access_token=" +
                                URLEncoder.encode(token, StandardCharsets.UTF_8.name());
                        callback(callbackId, true, getText(url, "Offroader/0.1"));
                    } else {
                        String coords = String.format(Locale.US, "%f,%f;%f,%f", startLon, startLat, endLon, endLat);
                        String url = "https://router.project-osrm.org/route/v1/driving/" + coords +
                                "?alternatives=true&steps=true&overview=full&geometries=geojson";
                        callback(callbackId, true, getText(url, "Offroader/0.1"));
                    }
                } catch (Exception e) { callback(callbackId, false, e.toString()); }
            });
        }

        @JavascriptInterface
        public void fetchSeattleCameras(String callbackId) {
            net.submit(() -> {
                try {
                    String url = "https://services.arcgis.com/ZOyb2t4B0UYuYNYH/arcgis/rest/services/Traffic_Cameras_CDL/FeatureServer/0/query" +
                            "?where=1%3D1&outFields=NAME%2CURL%2CLOCATION%2CSERVSTAT%2CSTREAM_NAME%2COWNERSHIP&outSR=4326&returnGeometry=true&f=geojson";
                    callback(callbackId, true, getText(url, "Offroader/0.1"));
                } catch (Exception e) { callback(callbackId, false, e.toString()); }
            });
        }

        @JavascriptInterface
        public void fetchFloridaCameras(String callbackId) {
            net.submit(() -> {
                try {
                    String url = "https://services.arcgis.com/3wFbqsFPLeKqOlIK/ArcGIS/rest/services/FL511_Traffic_Cameras/FeatureServer/0/query" +
                            "?where=1%3D1&outFields=ID%2CDESCRIPT%2CCOUNTY%2CHIGHWAY%2CDIRECTION%2CLATITUDE%2CLONGITUDE%2CIMAGE&outSR=4326&returnGeometry=true&f=geojson";
                    callback(callbackId, true, getText(url, "Offroader/0.1"));
                } catch (Exception e) { callback(callbackId, false, e.toString()); }
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
