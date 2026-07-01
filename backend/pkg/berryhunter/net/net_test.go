package net

import (
	"fmt"
	"log"
	"net/http"
	"testing"
	"time"
)

func OnConnected(c *Client) {
	fmt.Printf("Connected!\n")
	ticker := time.NewTicker(time.Second)
	go func() {
		for {
			c.SendMessage([]byte("Ping!"))
			<-ticker.C
		}
	}()
	c.OnMessage(func(c *Client, msg []byte) {
		fmt.Printf("Message: %s", string(msg))
	})
	c.OnDisconnect(func(c *Client) {
		fmt.Printf("Disconnected.")
	})
}

func TestClient_Run(t *testing.T) {
	// Not a real test: a manual ListenAndServe script with no timeout or teardown
	// that blocks `go test ./...` forever. Kept for manual WebSocket debugging;
	// run explicitly by removing the skip. See docs/skill-system-design.md,
	// Deferred Tech Debt.
	t.Skip("manual WebSocket smoke script, blocks forever — not part of the automated suite")

	http.HandleFunc("/ws", NewHandleFunc(OnConnected))

	err := http.ListenAndServe(":3000", nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
