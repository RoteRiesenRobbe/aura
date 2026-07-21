package items

import (
	"fmt"
)

// ItemID represents the ID of the item
type ItemID int

func (i ItemID) String() string {
	return fmt.Sprintf("ItemID(%d)", i)
}

// ItemStack represents a count of the same items.
// Count should be greater than or equal to 1.
type ItemStack struct {
	Item  Item
	Count int
}

func NewItemStack(item Item, count int) *ItemStack {
	return &ItemStack{
		Item:  item,
		Count: count,
	}
}

func NewSingleItemStack(item Item) *ItemStack {
	return &ItemStack{
		Item:  item,
		Count: 1,
	}
}

func (is *ItemStack) Copy() *ItemStack {
	return NewItemStack(is.Item, is.Count)
}
