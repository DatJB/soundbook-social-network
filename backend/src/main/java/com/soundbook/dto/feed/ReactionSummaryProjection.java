package com.soundbook.dto.feed;

import com.soundbook.entity.enums.ReactionType;

public interface ReactionSummaryProjection {
    Long getTargetId();
    ReactionType getReactionType();
    Long getTotal();
}
