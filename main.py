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

base_url = "https://elms.sti.edu"
json_filename = "users_data.json"

user_names = {}


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


def save_user_data(user_data):
    with open(json_filename, "w") as f:
        json.dump(user_data, f, indent=4)


def get_user_data(user_id, session):
    if user_id in user_names:
        return {"id": user_id, "name": user_names[user_id], "friends": []}

    url = f"{base_url}/user/show/{user_id}"
    try:
        response = session.get(url)
        if response.status_code != 200:
            print(f"Failed to fetch user data for user_id: {user_id}")
            return {"id": user_id, "name": None, "friends": []}
    except Exception as e:
        print(e)
        return {"id": user_id, "name": None, "friends": []}

    soup = BeautifulSoup(response.text, "html.parser")
    name_tag = soup.find("h1", class_="profile_name")
    name = name_tag.get_text(strip=True) if name_tag else None

    user_names[user_id] = name

    friends = []
    friend_elements = soup.select("ul.largeImgs li a")
    for friend in friend_elements:
        href = friend.get("href", "")
        if "/user/show/" in href:
            fid = href.split("/")[-1]
            fname_tag = friend.find("span")
            fname = fname_tag.get_text(strip=True) if fname_tag else None

            if fid in user_names:
                friends.append({"id": fid, "name": user_names[fid], "friends": []})
            else:
                time.sleep(0.5)
                data = get_user_data(fid, session)
                friends.append(data)

    return {"id": user_id, "name": name, "friends": friends}


def main():
    login()

    session = requests.Session()
    for cookie in driver.get_cookies():
        domain = cookie.get("domain") or urlparse(driver.current_url).netloc
        session.cookies.set(cookie["name"], cookie["value"], domain=domain)

    start_user_id = "11553731"
    tree = get_user_data(start_user_id, session)
    save_user_data(tree)


if __name__ == "__main__":
    main()
