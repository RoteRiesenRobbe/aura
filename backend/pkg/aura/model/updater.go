package model

type Updater interface {
	BasicEntity
	Update(dt float32)
}
