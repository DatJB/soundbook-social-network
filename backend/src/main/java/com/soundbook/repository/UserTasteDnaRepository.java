package com.soundbook.repository;

import com.soundbook.entity.UserTasteDna;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserTasteDnaRepository extends JpaRepository<UserTasteDna, Long> {

    @Query("SELECT t FROM UserTasteDna t WHERE t.user.id <> :excludeUserId")
    List<UserTasteDna> findCandidatesForMatching(@Param("excludeUserId") Long excludeUserId, Pageable pageable);
}
