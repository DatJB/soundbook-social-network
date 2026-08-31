package com.soundbook.event;

public record PostChangedEvent(
        Long authorId,
        Long postId,
        Action action
) {

    public enum Action {
        CREATED,
        UPDATED,
        DELETED
    }
}