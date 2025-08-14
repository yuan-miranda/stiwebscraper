from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from bs4 import BeautifulSoup
import requests
from urllib.parse import urlparse
import time
import json
from collections import deque

EMAIL = "miranda.339829@baliuag.sti.edu.ph"
PASSWORD = "watdapak234_"

driver = webdriver.Firefox()
wait = WebDriverWait(driver, 16)

base_url = "https://elms.sti.edu"
start_id = "11553731"
json_filename = "users_data.json"

names = {}
nodes = {}


def login():
    driver.get(base_url)

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
                (
                    By.XPATH,
                    "//div[@class='table' and @data-value='PhoneAppNotification']",
                )
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

    session = requests.Session()
    for cookie in driver.get_cookies():
        domain = cookie.get("domain") or urlparse(driver.current_url).netloc
        session.cookies.set(cookie["name"], cookie["value"], domain=domain)

    return session


def save_user_data(user_data):
    try:
        with open(json_filename, "w") as f:
            json.dump(user_data, f, indent=1)
    except Exception as e:
        print(f"Error saving user data: {e}")


def get_user_data_bfs(start_id, session):
    global nodes
    names.clear()  # clear previous names if needed
    nodes = {"id": start_id, "name": None, "friends": []}

    # queue items are tuples: (user_id, node_in_tree)
    queue = deque()
    queue.append((start_id, nodes))

    while queue:
        user_id, parent_node = queue.popleft()

        # skip visited
        if user_id in names:
            continue

        url = f"{base_url}/user/show/{user_id}"
        try:
            response = session.get(url)
            if response.status_code != 200:
                print(f"Failed to fetch user data for id: {user_id}")
                names[user_id] = None
                continue
        except Exception as e:
            print(e)
            names[user_id] = None
            continue

        soup = BeautifulSoup(response.text, "html.parser")
        name_tag = soup.find("h1", class_="profile_name")
        name = name_tag.get_text(strip=True) if name_tag else None

        names[user_id] = name
        parent_node["name"] = name

        # process friends
        friend_elements = soup.select("ul.largeImgs li a")
        for friend in friend_elements:
            href = friend.get("href", "")
            fname_tag = friend.find("span")
            fname = fname_tag.get_text(strip=True) if fname_tag else None

            if "/user/show/" in href:
                fid = href.split("/")[-1]
                if fid not in names:
                    friend_node = {"id": fid, "name": fname, "friends": []}
                    parent_node["friends"].append(friend_node)
                    queue.append((fid, friend_node))

        # save after each user, just like your recursive version
        save_user_data(nodes)

        # small delay to avoid hammering the server
        time.sleep(0.2)

    return nodes


def main():
    session = login()

    start_time = time.time()
    get_user_data_bfs(start_id, session)
    save_user_data(nodes)

    print(f"Elapsed time: {time.time() - start_time:.2f} seconds")


if __name__ == "__main__":
    main()

# 10704810 LONGASF
# 11553731 PIA
# 11631750
