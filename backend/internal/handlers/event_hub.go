package handlers

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type EventHub struct {
	mu      sync.RWMutex
	clients map[chan string]bool
}

func NewEventHub() *EventHub {
	return &EventHub{
		clients: make(map[chan string]bool),
	}
}

func (h *EventHub) Subscribe() chan string {
	h.mu.Lock()
	defer h.mu.Unlock()
	ch := make(chan string, 32)
	h.clients[ch] = true
	return ch
}

func (h *EventHub) Unsubscribe(ch chan string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[ch]; ok {
		delete(h.clients, ch)
		close(ch)
	}
}

func (h *EventHub) Broadcast(eventType string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.clients {
		select {
		case ch <- eventType:
		default:
		}
	}
}

// StreamEvents handles Server-Sent Events (SSE) connections for real-time multi-device sync
func (h *AppHandler) StreamEvents(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	ch := h.hub.Subscribe()
	defer h.hub.Unsubscribe(ch)

	// Initial connection handshake
	c.SSEvent("connected", "ok")
	c.Writer.Flush()

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	notify := c.Request.Context().Done()

	for {
		select {
		case <-notify:
			return
		case <-ticker.C:
			c.SSEvent("ping", "keepalive")
			c.Writer.Flush()
		case event := <-ch:
			c.SSEvent("message", event)
			c.Writer.Flush()
		}
	}
}
