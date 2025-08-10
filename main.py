from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import requests
from urllib.parse import urlparse
import time
import json
import os
from concurrent.futures import ThreadPoolExecutor

EMAIL = "miranda.339829@baliuag.sti.edu.ph"
PASSWORD = "watdapak234_"

driver = webdriver.Firefox()
wait = WebDriverWait(driver, 16)

driver.get("https://elms.sti.edu/")

wait.until(EC.element_to_be_clickable((By.LINK_TEXT, "Log in"))).click()
wait.until(EC.element_to_be_clickable((By.ID, "office365_sso_btn"))).click()

# microsoft login
# email
wait.until(EC.element_to_be_clickable((By.ID, "i0116"))).send_keys(EMAIL)
wait.until(EC.element_to_be_clickable((By.ID, "idSIButton9"))).click()

# password
wait.until(EC.element_to_be_clickable((By.ID, "i0118"))).send_keys(PASSWORD)
time.sleep(1)
wait.until(EC.element_to_be_clickable((By.ID, "idSIButton9"))).click()

# cases of MFA throwing error
try:
    approve_div = WebDriverWait(driver, 16).until(
        EC.element_to_be_clickable(
            (By.XPATH, "//div[@class='table' and @data-value='PhoneAppNotification']")
        )
    )
    approve_div.click()
except:
    pass

# case of that annoying elms.sti.edu stay log in prompt
try:
    yes_button = WebDriverWait(driver, 16).until(
        EC.element_to_be_clickable((By.ID, "idSIButton9"))
    )
    yes_button.click()
except:
    pass

WebDriverWait(driver, 60).until(EC.url_contains("/user_dashboard"))

print("Logged in successfully")

# do some magic here

session = requests.Session()
for cookie in driver.get_cookies():
    domain = cookie.get("domain") or urlparse(driver.current_url).netloc
    session.cookies.set(cookie["name"], cookie["value"], domain=domain)

base_url = "https://elms.sti.edu/user/show/"
json_filename = "users_data.json"

# load existing json data
if os.path.exists(json_filename):
    with open(json_filename, "r", encoding="utf-8") as f:
        all_results = json.load(f)
    if all_results:
        last_user_id = int(all_results[-1]["user_id"])
        start_id = max(0, last_user_id + 1)
    else:
        all_results = []
        start_id = 0
else:
    all_results = []
    start_id = 0

start_id = 0
end_id = 99999999

chunk_size = 100
max_threads = 16


def scrape_chunk(start, end, chunk_idx):
    results = []
    for user_id in range(start, end + 1):
        user_str = str(user_id).zfill(8)
        profile_url = base_url + user_str

        try:
            response = session.get(profile_url)
        except Exception as e:
            print(f"[Chunk {chunk_idx}] Request failed for {user_str}: {e}")
            continue

        user_data = {
            "user_id": user_str,
            "name": None,
            "campus": None,
            "about": None,
            "friends": [],
            "status": "not_found",
        }

        if "user_not_found" in response.url or response.status_code != 200:
            print(f"[Chunk {chunk_idx}] User {user_str} not found.")
            results.append(user_data)
        else:
            soup = BeautifulSoup(response.text, "html.parser")

            name_tag = soup.find("h1", class_="profile_name")
            name = name_tag.get_text(strip=True) if name_tag else None

            campus_tag = soup.select_one("div.profile_info a")
            campus = campus_tag.get_text(strip=True) if campus_tag else None

            about_section = None
            for block in soup.select("div.block"):
                h2 = block.find("h2")
                if h2 and h2.get_text(strip=True) == "About":
                    about_p = block.find("p")
                    about_section = about_p.get_text(strip=True) if about_p else None
                    break
            about = about_section if about_section else None

            friends = []
            for friend_name in soup.select("ul.largeImgs li a span"):
                friends.append(friend_name.get_text(strip=True))

            user_data = {
                "user_id": user_str,
                "name": name,
                "campus": campus,
                "about": about,
                "friends": friends,
                "status": "found",
            }
            print(f"[Chunk {chunk_idx}] Found user {user_str}: {name}")
            results.append(user_data)

        time.sleep(0.2)

    chunk_filename = (
        f"users_data_part_{chunk_idx}_{str(start).zfill(8)}_{str(end).zfill(8)}.json"
    )
    with open(chunk_filename, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


chunks = []
for i, start in enumerate(range(start_id, end_id + 1, chunk_size)):
    chunk_end = min(start + chunk_size - 1, end_id)
    chunks.append((start, chunk_end, i))

try:
    with ThreadPoolExecutor(max_workers=max_threads) as executor:
        futures = []
        for start, end, idx in chunks:
            futures.append(executor.submit(scrape_chunk, start, end, idx))

        for f in futures:
            f.result()

except KeyboardInterrupt:
    print("KeyboardInterrupt")

finally:
    driver.quit()
