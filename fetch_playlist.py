import urllib.request
import json
import re
import sys
import ssl

def extract_videos(obj, playlist_items):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == 'lockupViewModel':
                try:
                    videoId = v.get('contentId', '')
                    title = v.get('metadata', {}).get('lockupMetadataViewModel', {}).get('title', {}).get('content', 'Unknown')
                    
                    author = "Unknown"
                    metadata_rows = v.get('metadata', {}).get('lockupMetadataViewModel', {}).get('metadata', {}).get('contentMetadataViewModel', {}).get('metadataRows', [])
                    if metadata_rows:
                        parts = metadata_rows[0].get('metadataParts', [])
                        if parts:
                            # Concatenate all text runs to capture multiple authors properly
                            author = "".join([part.get('text', {}).get('content', '') for part in parts if 'text' in part])
                            if not author:
                                author = "Unknown"
                    
                    if videoId:
                        playlist_items.append({
                            "videoId": videoId,
                            "title": title,
                            "author": author,
                            "hyperlink": f"https://www.youtube.com/watch?v={videoId}",
                            "illustrationPath": f"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg"
                        })
                except Exception as e:
                    pass
            else:
                extract_videos(v, playlist_items)
    elif isinstance(obj, list):
        for item in obj:
            extract_videos(item, playlist_items)

def get_playlists(urls):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    playlist_items = []
    
    for url in urls:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx) as response:
            html = response.read().decode('utf-8')
        
        match = re.search(r'var ytInitialData = (\{.*?\});', html)
        if not match:
            print(f"Could not find ytInitialData for {url}")
            continue
            
        data = json.loads(match.group(1))
        extract_videos(data, playlist_items)
    
        # Process, filter and remove duplicates
    seen = set()
    unique_items = []
    idx = 1
    
    # Add explicit single videos
    single_videos = [
        "2OU1CXczW2Y",
        "modseqe9KtY",
        "sAUdWpemfGw",
        "BI9Ue6JwJic",
        "eSW2LVbPThw",
        "uFRPeiAEO0M",
        "lw7pcm1W5tw",
        "dBQg24mx45Y",
        "kqj7b59D85Y",
        "Soy4jGPHr3g",
        "K0QKls5uVMM",
        "D6DVTLvOupE",
        "mxj3mW4jf7Q",
        "lgAlH2HwbGA",
        "9QLT1Aw_45s",
        "9OBmDkSlkrQ",
        "LLjfal8jCYI",
        "HTxwOxFt5d4",
        "F38EuG2dAyM",
        "hXabKIYl_Yo",
        "mq88yUFdVng",
        "2-zPY0vrpjQ",
        "LaEgpNBt-bQ",
        "5l8VZEyNRH8",
        "RyRfLSOewbU",
        "TxOA6VGGxgU",
        "16M9oC-a5bY",
        "h69jvhd8z4w"
    ]
    for videoId in single_videos:
        try:
            req = urllib.request.Request(f'https://www.youtube.com/watch?v={videoId}', headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ctx) as response:
                html = response.read().decode('utf-8')
            title_match = re.search(r'<meta name="title" content="([^"]*)"', html)
            author_match = re.search(r'<link itemprop="name" content="([^"]*)"', html)
            if title_match and author_match:
                playlist_items.append({
                    "videoId": videoId,
                    "title": title_match.group(1).replace('&#39;', "'").replace('&amp;', '&'),
                    "author": author_match.group(1),
                    "hyperlink": f"https://www.youtube.com/watch?v={videoId}",
                    "illustrationPath": f"https://i.ytimg.com/vi/{videoId}/hqdefault.jpg"
                })
        except Exception as e:
            print(f"Failed to fetch video {videoId}: {e}")

    for item in playlist_items:
        # Filter specific videos
        excluded_urls = [
            "https://www.youtube.com/watch?v=iCh7KuXBO78",
            "https://www.youtube.com/watch?v=X2n-TqnqskM",
            "https://www.youtube.com/watch?v=b2GJcYBoVyg",
            "https://www.youtube.com/watch?v=BTekXS9d-no",
            "https://www.youtube.com/watch?v=LTNhnSYd5CU",
            "https://www.youtube.com/watch?v=fjHZcOcP38g",
            "https://www.youtube.com/watch?v=WXvm5XfkXrk",
            "https://www.youtube.com/watch?v=HoCyrteE0Ik"
        ]
        if item.get('hyperlink') in excluded_urls:
            continue
            
        # Filter nory
        if 'nory' in item['author'].lower():
            continue
            
        # Filter One Voice
        if 'one voice' in item['title'].lower():
            continue
            
        # Filter remix
        if 'remix' in item['title'].lower() or 'remix' in item['author'].lower():
            continue
            
        # Author cleanup: remove "Hatsune Miku" if other authors exist
        # e.g., "Hatsune Miku • Orangestar" -> "Orangestar"
        author = item['author']
        # The delimiter might be " • " or ", " or " & " or " 和 "
        # First handle "Hatsune Miku" string
        if 'Hatsune Miku' in author and author.strip() != 'Hatsune Miku':
            author = author.replace('Hatsune Miku', '')
            # Clean up remaining delimiters
            author = re.sub(r'^[ \-•,&|/和]+', '', author)
            author = re.sub(r'[ \-•,&|/和]+$', '', author)
            author = author.replace(' •  • ', ' • ')
            author = author.strip()
            item['author'] = author if author else 'Hatsune Miku' # Fallback if empty

        if item['hyperlink'] not in seen:
            seen.add(item['hyperlink'])
            # Add the 'id' field expected by script.js
            item['id'] = f"vocaloid-{idx}"
            del item['videoId'] # remove videoId as it's not needed
            unique_items.append(item)
            idx += 1
    
    with open('Data/vocaloidlist.json', 'w', encoding='utf-8') as f:
        json.dump(unique_items, f, ensure_ascii=False, indent=4)
    print(f"Saved {len(unique_items)} items to Data/vocaloidlist.json")

if __name__ == '__main__':
    urls = [
        'https://youtube.com/playlist?list=PLe3lDALUYk1SVfL8A2-6RN5z89QEPz5m4',
        'https://youtube.com/playlist?list=PL-pKPpZ1Q5Nbw0GsDT9V6aGzrQASzWZ6k'
    ]
    get_playlists(urls)
