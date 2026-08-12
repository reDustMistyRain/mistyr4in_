import urllib.request
import urllib.parse
import ssl
import re

ssl._create_default_https_context = ssl._create_unverified_context
url = "https://www.books.com.tw/products/0011045837"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
html = urllib.request.urlopen(req).read().decode('utf-8')

# parse title
match_title = re.search(r'<title>博客來-(.*?)</title>', html)
if match_title:
    title = match_title.group(1).strip()
    print(f"Title: {title}")

# parse author
# Authors are usually in <a href="//search.books.com.tw/search/query/key/.../adv_author/1">AuthorName</a>
match_author = re.search(r'<a href="//search\.books\.com\.tw/search/query/key/[^"]+/adv_author/1">(.*?)</a>', html)
if match_author:
    author = match_author.group(1).strip()
    print(f"Author: {author}")
