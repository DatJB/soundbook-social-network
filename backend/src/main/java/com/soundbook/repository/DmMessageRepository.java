package com.soundbook.repository;

import com.soundbook.entity.DmMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface DmMessageRepository extends JpaRepository<DmMessage, Long> {

		@Query("""
						select m
						from DmMessage m
						where m.thread.id = :threadId
							and (
								(m.sender.id = :userId and m.deletedForSender = false)
								or (m.sender.id <> :userId and m.deletedForReceiver = false)
							)
							and (
								:createdAt is null
								or m.createdAt < :createdAt
								or (m.createdAt = :createdAt and m.id < :cursorId)
							)
						order by m.createdAt desc, m.id desc
						""")
		List<DmMessage> findVisibleMessagesWithCursor(
						@Param("threadId") Long threadId,
						@Param("userId") Long userId,
						@Param("createdAt") LocalDateTime createdAt,
						@Param("cursorId") Long cursorId,
						Pageable pageable
		);

    @Query(value = "SELECT m FROM DmMessage m JOIN FETCH m.sender WHERE m.thread.id = :threadId",
            countQuery = "SELECT COUNT(m) FROM DmMessage m WHERE m.thread.id = :threadId")
    Page<DmMessage> findByThreadId(@Param("threadId") Long threadId, Pageable pageable);
}
