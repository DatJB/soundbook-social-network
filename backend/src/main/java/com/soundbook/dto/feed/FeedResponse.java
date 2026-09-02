package com.soundbook.dto.feed;

import com.soundbook.dto.taste.MatchUserResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FeedResponse {
    private String tab;
    private List<FeedPostResponse> posts;
    private List<MatchUserResponse> friendSuggestions;
    private List<FeedTrendingResponse> trending;
    private Boolean hasMore;
}
