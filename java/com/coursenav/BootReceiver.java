package com.coursenav;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences sp = ctx.getSharedPreferences("cnav", Context.MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(sp.getString("alarms", "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                long at = o.optLong("at");
                if (at > now) {
                    MainActivity.schedule(ctx, o.optString("id"), o.optString("title"),
                            o.optString("text"), at);
                }
            }
        } catch (Exception ignored) {}
    }
}
