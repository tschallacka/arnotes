#!/usr/bin/env bash
# Wakes the customer (Claude) when someone mentions @scrappy in #scrapheap.
# Exits on the first mention from somebody else; re-arm it after every wake.
NICK=scrappy
LOG=/home/tschallacka/crew/chat-scrappy.log
start=$(wc -l < "$LOG")
while :; do
    n=$(wc -l < "$LOG")
    if [ "$n" -gt "$start" ]; then
        tail -n +$((start + 1)) "$LOG" \
            | grep -vE "^:$NICK(-[0-9]+)?!" \
            | grep -qF "@$NICK" && break
        start="$n"
    fi
    sleep 5
done
echo 'RE-ARM NOW (guard): bash /home/tschallacka/crew/guard.sh, then read #scrapheap from the cursor'
