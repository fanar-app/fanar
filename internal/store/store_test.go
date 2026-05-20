package store

import (
	"reflect"
	"strconv"
	"testing"
	"time"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := New(":memory:")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestListEmpty(t *testing.T) {
	s := newTestStore(t)
	payloads, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(payloads) != 0 {
		t.Fatalf("want 0 payloads, got %d", len(payloads))
	}
}

func TestInsertAndList(t *testing.T) {
	s := newTestStore(t)
	p := Payload{
		ID:        "test-1",
		RequestID: "req-1",
		Type:      "log",
		Label:     "hello",
		Color:     "#fff",
		Content:   `{"msg":"hi"}`,
		Origin:    Origin{File: "main.go", Line: 10, Function: "main"},
		Timestamp: time.Now().UTC().Truncate(time.Second),
	}
	if err := s.Insert(p); err != nil {
		t.Fatalf("Insert: %v", err)
	}
	payloads, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(payloads) != 1 {
		t.Fatalf("want 1 payload, got %d", len(payloads))
	}
	got := payloads[0]
	got.Timestamp = got.Timestamp.UTC().Truncate(time.Second)
	if !reflect.DeepEqual(p, got) {
		t.Errorf("round-trip mismatch:\nwant %+v\n got %+v", p, got)
	}
}

func TestInsertPrunesAtLimit(t *testing.T) {
	s := newTestStore(t)
	for i := range maxPayloads + 10 {
		if err := s.Insert(Payload{
			ID:        strconv.Itoa(i),
			Type:      "test",
			Timestamp: time.Now(),
		}); err != nil {
			t.Fatalf("Insert %d: %v", i, err)
		}
	}
	payloads, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(payloads) != maxPayloads {
		t.Fatalf("want %d payloads after pruning, got %d", maxPayloads, len(payloads))
	}
}

func TestClear(t *testing.T) {
	s := newTestStore(t)
	if err := s.Insert(Payload{ID: "a", Type: "test", Timestamp: time.Now()}); err != nil {
		t.Fatalf("Insert: %v", err)
	}
	if err := s.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}
	payloads, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(payloads) != 0 {
		t.Fatalf("want 0 payloads after Clear, got %d", len(payloads))
	}
}
