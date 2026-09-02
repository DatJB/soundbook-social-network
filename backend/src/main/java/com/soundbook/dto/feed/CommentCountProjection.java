package com.soundbook.dto.feed;

public interface CommentCountProjection {
    Long getPostId();
    Long getTotal();
}
