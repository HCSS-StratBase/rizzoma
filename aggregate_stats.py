import json
import os
import csv
import re
from datetime import datetime
from collections import defaultdict

csv.field_size_limit(10**7)
csv_path = 'backups/fulltext-data.csv'
json_dir = 'backups/json'
output_file = 'dashboard_data.js'

def get_tokens(text):
    if not text: return 0
    return len(re.findall(r'\w+', text))

# Structures for High-Res Materialization
user_stats = defaultdict(lambda: {
    "t": 0, "m": 0, "first": None, "last": None, 
    "daily": defaultdict(lambda: {"t":0, "m":0}),
    "hourly": [0]*24, "dow": [0]*7
})
topic_stats = defaultdict(lambda: {
    "t": 0, "m": 0, "first": None, "last": None, 
    "daily": defaultdict(lambda: {"t":0, "m":0}),
    "users": defaultdict(int),
    "hourly": [0]*24, "dow": [0]*7
})
global_daily = defaultdict(lambda: {"t":0, "m":0})
global_hourly = [0]*24
global_dow = [0]*7
user_map = {}

print("Building Rizzoma Analysis Matrix...")

with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.DictReader(f)
    for row in reader:
        email = row.get('mail', '').lower()
        if not email or email == '(unknown)': continue
        user_map[email] = row.get('name', email.split('@')[0])
            
        tid = row.get('topic', '')
        tokens = get_tokens(row.get('text', ''))
        ts_str = row.get('timestamp', '')
        
        try:
            dt = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
            d_bin = dt.strftime("%Y-%m-%d")
            h, dow = dt.hour, dt.weekday()
            iso = dt.isoformat()
            
            # Global
            global_daily[d_bin]["t"] += tokens
            global_daily[d_bin]["m"] += 1
            global_hourly[h] += 1
            global_dow[dow] += 1
            
            # User
            u = user_stats[email]
            u["t"] += tokens; u["m"] += 1
            u["daily"][d_bin]["t"] += tokens; u["daily"][d_bin]["m"] += 1
            u["hourly"][h] += 1; u["dow"][dow] += 1
            if not u["first"] or iso < u["first"]: u["first"] = iso
            if not u["last"] or iso > u["last"]: u["last"] = iso
            
            # Topic
            t = topic_stats[tid]
            t["t"] += tokens; t["m"] += 1
            t["daily"][d_bin]["t"] += tokens; t["daily"][d_bin]["m"] += 1
            t["users"][email] += tokens
            t["hourly"][h] += 1; t["dow"][dow] += 1
            if not t["first"] or iso < t["first"]: t["first"] = iso
            if not t["last"] or iso > t["last"]: t["last"] = iso
        except: continue

# Process JSON metadata
topic_meta = {}
for filename in os.listdir(json_dir):
    if filename.endswith('.json'):
        tid = filename.split('_')[-1].replace('.json', '')
        with open(os.path.join(json_dir, filename), 'r') as f:
            try:
                d = json.load(f)
                topic_meta[tid] = {"title": d.get('title'), "url": d.get('url')}
            except: continue

# Format Final Data
latest_global = max([u["last"] for u in user_stats.values() if u["last"]])
latest_dt = datetime.fromisoformat(latest_global)

formatted_users = []
for email, s in user_stats.items():
    diff = (latest_dt - datetime.fromisoformat(s["last"])).days
    formatted_users.append({
        "id": email, "name": user_map.get(email),
        "tokens": s["t"], "msgs": s["m"], 
        "status": "Active" if diff < 60 else ("Occasional" if diff < 365 else "Dormant"),
        "first": s["first"], "last": s["last"],
        "hourly": s["hourly"], "dow": s["dow"],
        "daily": sorted([{"d": k, "t": v["t"], "m": v["m"]} for k,v in s["daily"].items()], key=lambda x: x['d'])
    })

formatted_topics = []
for tid, s in topic_stats.items():
    meta = topic_meta.get(tid, {"title": tid, "url": ""})
    formatted_topics.append({
        "id": tid, "title": meta["title"], "url": meta["url"],
        "tokens": s["t"], "msgs": s["m"], "users_count": len(s["users"]),
        "hourly": s["hourly"], "dow": s["dow"],
        "daily": sorted([{"d": k, "t": v["t"], "m": v["m"]} for k,v in s["daily"].items()], key=lambda x: x['d']),
        "user_dist": sorted([{"n": user_map.get(e,e), "v": v} for e,v in s["users"].items()], key=lambda x: x['v'], reverse=True)[:15]
    })

final_json = {
    "users": sorted(formatted_users, key=lambda x: x['tokens'], reverse=True),
    "topics": sorted(formatted_topics, key=lambda x: x['tokens'], reverse=True),
    "global_daily": sorted([{"d": k, "t": v["t"], "m": v["m"]} for k,v in global_daily.items()], key=lambda x: x['d']),
    "global_hourly": global_hourly, "global_dow": global_dow
}

with open(output_file, 'w') as f:
    f.write(f"const dashboardData = {json.dumps(final_json)};")

print("Rizzoma Analysis Matrix Complete.")
