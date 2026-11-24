<?php
/**
 * Plugin Name: Gunnarsfell Headless
 * Description: Makes WordPress the content admin for the static gunnarsfell.is front end: content API, a simple "Verkin" screen, the contact form endpoint and the rebuild trigger.
 * Version: 1.0.0
 *
 * Optional constants (wp-config.php):
 *   GUNNARSFELL_FRONTEND_URL  Public site URL, e.g. https://gunnarsfell.is. When set, WordPress's own
 *                             front end redirects there and the contact endpoint accepts that origin.
 *   GUNNARSFELL_DEPLOY_HOOK   URL to POST to when a project or testimonial changes (rebuilds the site).
 *   GUNNARSFELL_CONTACT_TO    Recipient override for contact form mail.
 *   GUNNARSFELL_CLIENT_IP_HEADER  $_SERVER key holding the visitor's address when WordPress is behind
 *                             a proxy or CDN, e.g. 'HTTP_CF_CONNECTING_IP'. Used for the form's rate limit.
 */

defined( 'ABSPATH' ) || exit;

const GF_REST_NS        = 'gunnarsfell/v1';
const GF_GALLERY_FIELD  = 'myndir';
const GF_FEATURED_FIELD = 'a_forsidu';
const GF_CONTENT_TYPES  = array( 'verk', 'umsogn' );
const GF_CONTACT_FORM   = 1043; // WPForms "Hafa Samband": source of recipient and subject.
const GF_RATE_LIMIT     = 5;    // Contact submissions per IP per hour.
const GF_MIN_FILL_MS    = 3000; // Faster than this is a bot.

function gf_frontend_url(): string {
	return defined( 'GUNNARSFELL_FRONTEND_URL' ) ? untrailingslashit( GUNNARSFELL_FRONTEND_URL ) : '';
}

/* -------------------------------------------------------------------------
 * 1. Content API
 * ---------------------------------------------------------------------- */

add_action( 'rest_api_init', function () {
	register_rest_route( GF_REST_NS, '/content', array(
		'methods'             => 'GET',
		'permission_callback' => '__return_true',
		'callback'            => 'gf_rest_content',
	) );
	register_rest_route( GF_REST_NS, '/contact', array(
		'methods'             => 'POST',
		'permission_callback' => '__return_true',
		'callback'            => 'gf_rest_contact',
	) );
} );

/** One attachment in the shape the front end renders. Null when the file is gone. */
function gf_image( int $id ): ?array {
	$full = wp_get_attachment_image_src( $id, 'full' );
	if ( ! $full ) {
		return null;
	}
	$sizes = array();
	foreach ( array( 'thumbnail', 'medium', 'medium_large', 'large' ) as $size ) {
		$src = wp_get_attachment_image_src( $id, $size );
		if ( $src ) {
			$sizes[ $size ] = array( 'url' => $src[0], 'width' => (int) $src[1], 'height' => (int) $src[2] );
		}
	}
	return array(
		'id'      => $id,
		'url'     => $full[0],
		'width'   => (int) $full[1],
		'height'  => (int) $full[2],
		'alt'     => (string) get_post_meta( $id, '_wp_attachment_image_alt', true ),
		'caption' => (string) wp_get_attachment_caption( $id ),
		'mime'    => (string) get_post_mime_type( $id ),
		'srcset'  => (string) wp_get_attachment_image_srcset( $id, 'full' ),
		'sizes'   => (object) $sizes,
	);
}

/**
 * Yoast's head data for a post as it appears on the public URL, or null when Yoast is off.
 * Text values come entity-encoded for direct output; they are decoded here so the front end
 * can escape them itself. The schema graph is plain JSON already.
 */
function gf_seo( int $post_id ): ?array {
	if ( ! function_exists( 'YoastSEO' ) ) {
		return null;
	}
	$json = gf_is_front_page( $post_id ) ? gf_front_page_head( $post_id ) : ( YoastSEO()->meta->for_post( $post_id ) ?: null )?->get_head()->json;
	if ( ! $json ) {
		return null;
	}
	$head = json_decode( wp_json_encode( $json ), true );
	foreach ( $head as $key => $value ) {
		if ( is_string( $value ) && 'schema' !== $key ) {
			$head[ $key ] = html_entity_decode( $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		}
	}
	return gf_with_primary_image( $head );
}

/**
 * Yoast finds an Elementor page's main image only while rendering the page itself. The share image
 * it stored for the page is the same picture, so the schema's primary image is filled in from that.
 */
function gf_with_primary_image( array $head ): array {
	$image = $head['og_image'][0] ?? null;
	$graph = $head['schema']['@graph'] ?? array();
	$index = false;
	foreach ( $graph as $i => $piece ) {
		if ( in_array( 'WebPage', (array) ( $piece['@type'] ?? array() ), true ) ) {
			$index = $i;
			break;
		}
	}
	if ( ! $image || false === $index || isset( $graph[ $index ]['primaryImageOfPage'] ) ) {
		return $head;
	}
	$attachment = attachment_url_to_postid( $image['url'] );
	$size       = $attachment ? wp_get_attachment_metadata( $attachment ) : array();
	$width      = (int) ( ( $image['width'] ?? 0 ) ?: ( $size['width'] ?? 0 ) );
	$height     = (int) ( ( $image['height'] ?? 0 ) ?: ( $size['height'] ?? 0 ) );
	if ( ! $width || ! $height ) {
		return $head;
	}
	$id      = ( $graph[ $index ]['@id'] ?? home_url( '/' ) ) . '#primaryimage';
	$caption = $attachment ? wp_get_attachment_caption( $attachment ) : '';
	$object  = array_filter( array(
		'@type'      => 'ImageObject',
		'inLanguage' => $graph[ $index ]['inLanguage'] ?? null,
		'@id'        => $id,
		'url'        => $image['url'],
		'contentUrl' => $image['url'],
		'width'      => $width,
		'height'     => $height,
		'caption'    => $caption ?: null,
	) );
	$graph[ $index ] += array(
		'primaryImageOfPage' => array( '@id' => $id ),
		'image'              => array( '@id' => $id ),
		'thumbnailUrl'       => $image['url'],
	);
	array_splice( $graph, $index + 1, 0, array( $object ) );
	$head['schema']['@graph'] = $graph;
	return $head;
}

function gf_is_front_page( int $post_id ): bool {
	return 'page' === get_option( 'show_on_front' ) && (int) get_option( 'page_on_front' ) === $post_id;
}

/**
 * Yoast builds the front page's head (og:type website, schema "about" the organisation, primary
 * image) from the page being viewed, not from the post. Over REST nothing is being viewed, so the
 * front page is made the current query for the duration of the call.
 */
function gf_front_page_head( int $post_id ) {
	global $wp_query, $wp_the_query;
	$saved        = array( $wp_query, $wp_the_query );
	$wp_query     = new WP_Query( array( 'page_id' => $post_id ) ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride -- restored below.
	$wp_the_query = $wp_query; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
	try {
		// The head is computed lazily, so it has to be read while the query is still in place.
		return YoastSEO()->meta->for_current_page()->get_head()->json;
	} finally {
		list( $wp_query, $wp_the_query ) = $saved; // phpcs:ignore WordPress.WP.GlobalVariablesOverride
	}
}

function gf_gallery_ids( int $post_id ): array {
	$ids = get_post_meta( $post_id, GF_GALLERY_FIELD, true );
	return is_array( $ids ) ? array_values( array_filter( array_map( 'intval', $ids ) ) ) : array();
}

function gf_entry( WP_Post $post ): array {
	$thumb = (int) get_post_thumbnail_id( $post );
	return array(
		'id'       => $post->ID,
		'slug'     => $post->post_name,
		'path'     => wp_parse_url( get_permalink( $post ), PHP_URL_PATH ),
		'title'    => get_the_title( $post ),
		'date'     => mysql2date( 'c', $post->post_date_gmt, false ),
		'modified' => mysql2date( 'c', $post->post_modified_gmt, false ),
		'image'    => $thumb ? gf_image( $thumb ) : null,
		'seo'      => gf_seo( $post->ID ),
	);
}

function gf_rest_content(): WP_REST_Response {
	// Published and not password-protected: this route is public.
	$query = static fn( string $type, array $order = array() ) => get_posts( $order + array(
		'post_type'      => $type,
		'post_status'    => 'publish',
		'has_password'   => false,
		'posts_per_page' => -1,
		'orderby'        => 'title',
		'order'          => 'ASC',
	) );

	$verk = array_map( static function ( WP_Post $post ) {
		$gallery = array_values( array_filter( array_map( 'gf_image', gf_gallery_ids( $post->ID ) ) ) );
		return gf_entry( $post ) + array(
			'description' => (string) get_post_meta( $post->ID, 'lysing', true ),
			'gallery'     => $gallery,
			'featured'    => (bool) get_post_meta( $post->ID, GF_FEATURED_FIELD, true ),
		);
	}, $query( 'verk' ) );

	$umsogn = array_map( static fn( WP_Post $post ) => gf_entry( $post ) + array(
		'role'    => $post->post_excerpt,
		'content' => apply_filters( 'the_content', $post->post_content ),
	), $query( 'umsogn', array( 'orderby' => 'date', 'order' => 'ASC' ) ) );

	$pages = array_map( 'gf_entry', $query( 'page' ) );

	$response = new WP_REST_Response( array(
		'origin' => home_url(),
		'site'   => array( 'name' => get_bloginfo( 'name' ), 'description' => get_bloginfo( 'description' ) ),
		'pages'  => $pages,
		'verk'   => $verk,
		'umsogn' => $umsogn,
	) );
	$response->header( 'Cache-Control', 'no-store' );
	return $response;
}

/* -------------------------------------------------------------------------
 * 2. Projects: description field and automatic cover image
 * ---------------------------------------------------------------------- */

add_action( 'acf/init', function () {
	if ( ! function_exists( 'acf_add_local_field_group' ) ) {
		return;
	}
	acf_add_local_field_group( array(
		'key'        => 'group_gf_verk_lysing',
		'title'      => 'Lýsing',
		'menu_order' => 5,
		'location'   => array( array( array( 'param' => 'post_type', 'operator' => '==', 'value' => 'verk' ) ) ),
		'fields'     => array( array(
			'key'          => 'field_gf_verk_lysing',
			'name'         => 'lysing',
			'label'        => 'Lýsing (valfrjálst)',
			'type'         => 'textarea',
			'rows'         => 3,
			'new_lines'    => '',
			'instructions' => 'Ein eða tvær setningar um verkið. Má sleppa.',
		) ),
	) );
	// The client picks which projects open the home page; the front end fills any free spots itself.
	acf_add_local_field_group( array(
		'key'        => 'group_gf_verk_forsida',
		'title'      => 'Forsíða',
		'position'   => 'side',
		'menu_order' => 6,
		'location'   => array( array( array( 'param' => 'post_type', 'operator' => '==', 'value' => 'verk' ) ) ),
		'fields'     => array( array(
			'key'          => 'field_gf_verk_a_forsidu',
			'name'         => GF_FEATURED_FIELD,
			'label'        => 'Sýna á forsíðu',
			'type'         => 'true_false',
			'ui'           => 1,
			'ui_on_text'   => 'Já',
			'ui_off_text'  => 'Nei',
			'instructions' => 'Verkið birtist í stóru myndunum efst á forsíðunni. Þar er pláss fyrir fimm verk; ef færri eru valin fyllir vefurinn upp með þeim verkum sem hafa flestar myndir.',
		) ),
	) );
} );

add_filter( 'acf/prepare_field/name=' . GF_GALLERY_FIELD, function ( $field ) {
	if ( $field ) {
		$field['instructions'] = 'Smelltu á „Add to gallery“ og dragðu allar myndirnar inn í einu. Fyrsta myndin verður forsíðumynd verksins.';
	}
	return $field;
} );

/** The first gallery image becomes the cover when the project has none. */
function gf_set_cover_from_gallery( $post_id ): void {
	if ( ! is_numeric( $post_id ) || 'verk' !== get_post_type( (int) $post_id ) || has_post_thumbnail( (int) $post_id ) ) {
		return;
	}
	$ids = gf_gallery_ids( (int) $post_id );
	if ( $ids ) {
		set_post_thumbnail( (int) $post_id, $ids[0] );
	}
}
add_action( 'acf/save_post', 'gf_set_cover_from_gallery', 20 );

/* -------------------------------------------------------------------------
 * 3. Simple admin
 * ---------------------------------------------------------------------- */

/** Everyone gets the simple admin unless they ticked "full admin" on their profile. */
function gf_simple_admin(): bool {
	return ! ( current_user_can( 'manage_options' ) && get_user_meta( get_current_user_id(), 'gf_full_admin', true ) );
}

add_filter( 'register_post_type_args', function ( array $args, string $type ) {
	$labels = array(
		'verk'   => array(
			'name' => 'Verkin', 'singular_name' => 'Verk', 'menu_name' => 'Verkin', 'all_items' => 'Öll verk',
			'add_new' => 'Bæta við verki', 'add_new_item' => 'Bæta við verki', 'edit_item' => 'Breyta verki',
			'new_item' => 'Nýtt verk', 'view_item' => 'Skoða verk', 'search_items' => 'Leita í verkum',
			'not_found' => 'Engin verk fundust', 'featured_image' => 'Forsíðumynd',
			'set_featured_image' => 'Velja forsíðumynd', 'remove_featured_image' => 'Fjarlægja forsíðumynd',
			'item_published' => 'Verkið er komið á vefinn.', 'item_updated' => 'Verkið var uppfært.',
		),
		'umsogn' => array(
			'add_new' => 'Bæta við umsögn', 'add_new_item' => 'Bæta við umsögn', 'edit_item' => 'Breyta umsögn',
			'all_items' => 'Allar umsagnir', 'item_published' => 'Umsögnin er komin á vefinn.',
			'item_updated' => 'Umsögnin var uppfærð.',
		),
	);
	if ( isset( $labels[ $type ] ) ) {
		$args['labels'] = array_merge( (array) ( $args['labels'] ?? array() ), $labels[ $type ] );
	}
	return $args;
}, 20, 2 );

add_filter( 'enter_title_here', function ( string $text, WP_Post $post ) {
	return 'verk' === $post->post_type ? 'Heiti verksins, t.d. „Nýr sólpallur í Kópavogi“' : $text;
}, 10, 2 );

add_action( 'admin_menu', function () {
	if ( ! gf_simple_admin() ) {
		return;
	}
	global $menu;
	$keep = array( 'edit.php?post_type=verk', 'edit.php?post_type=umsogn', 'upload.php', 'profile.php' );
	foreach ( (array) $menu as $item ) {
		if ( ! in_array( $item[2], $keep, true ) ) {
			remove_menu_page( $item[2] );
		}
	}
	remove_submenu_page( 'edit.php?post_type=verk', 'edit-tags.php?taxonomy=category&amp;post_type=verk' );
}, 9999 );

// Pruned at render time, after every plugin has added its items.
add_action( 'wp_before_admin_bar_render', function () {
	global $wp_admin_bar;
	if ( ! is_admin() || ! gf_simple_admin() || ! $wp_admin_bar instanceof WP_Admin_Bar ) {
		return;
	}
	$keep = array( 'user-actions', 'user-info', 'edit-profile', 'logout', 'my-account', 'top-secondary', 'site-name', 'menu-toggle' );
	foreach ( (array) $wp_admin_bar->get_nodes() as $node ) {
		if ( ! in_array( $node->id, $keep, true ) ) {
			$wp_admin_bar->remove_node( $node->id );
		}
	}
}, 9999 );

// Projects first: it is what the client comes here for.
add_filter( 'custom_menu_order', 'gf_simple_admin' );
add_filter( 'menu_order', function ( array $order ) {
	if ( ! gf_simple_admin() ) {
		return $order;
	}
	$first = array( 'edit.php?post_type=verk', 'edit.php?post_type=umsogn', 'upload.php' );
	return array_merge( $first, array_diff( $order, $first ) );
} );

// The dashboard has nothing the client needs: land on the project list.
add_action( 'load-index.php', function () {
	if ( gf_simple_admin() ) {
		wp_safe_redirect( admin_url( 'edit.php?post_type=verk' ) );
		exit;
	}
} );

// Project and testimonial screens show only what is filled in. The other boxes are hidden, not
// removed: the plugins that own them (Yoast, Astra) run scripts that expect them on the page.
add_filter( 'hidden_meta_boxes', function ( array $hidden, WP_Screen $screen ) {
	if ( ! gf_simple_admin() || 'post' !== $screen->base || ! in_array( $screen->post_type, GF_CONTENT_TYPES, true ) ) {
		return $hidden;
	}
	global $wp_meta_boxes;
	$ids = array();
	foreach ( (array) ( $wp_meta_boxes[ $screen->id ] ?? array() ) as $priorities ) {
		foreach ( $priorities as $boxes ) {
			$ids = array_merge( $ids, array_keys( $boxes ) );
		}
	}
	$keep = static fn( $id ) => in_array( $id, array( 'submitdiv', 'postimagediv', 'postexcerpt' ), true ) || str_starts_with( $id, 'acf-' );
	return array_values( array_filter( $ids, static fn( $id ) => ! $keep( $id ) ) );
}, 9999, 2 );

// The photo box is named after its field, not the field group's internal name.
add_filter( 'acf/load_field_group', function ( $group ) {
	if ( is_array( $group ) && 'gallery_verk' === ( $group['title'] ?? '' ) && ! ( function_exists( 'acf_is_screen' ) && acf_is_screen( 'acf-field-group' ) ) ) {
		$group['title'] = 'Myndir';
	}
	return $group;
} );

add_action( 'admin_head', function () {
	if ( gf_simple_admin() ) {
		// Plugin nags are noise for the client; the save/publish message (#message) stays.
		// Also hidden: Elementor's editor switch, Yoast's scores and list filters.
		echo '<style>'
			. '.notice:not(#message):not(.gf-notice),.update-nag,#screen-meta-links,#wpfooter,'
			. '#elementor-switch-mode,#elementor-editor,.misc-pub-section.yoast,'
			. '#posts-filter .tablenav select[name^="seo_"],#posts-filter .tablenav select[name="readability_filter"],'
			. '#posts-filter .tablenav select[name="cat"],#posts-filter .tablenav #post-query-submit,'
			. '.subsubsub .yoast_cornerstone'
			. '{display:none!important}</style>';
	}
} );

// Cover thumbnail in the project list, so the client sees what is on the site; plugin columns go.
add_filter( 'manage_verk_posts_columns', function ( array $columns ) {
	$columns = array_slice( $columns, 0, 1, true ) + array( 'gf_cover' => 'Mynd' ) + $columns + array( 'gf_featured' => 'Á forsíðu' );
	if ( ! gf_simple_admin() ) {
		return $columns;
	}
	// Only these, in this order.
	$kept = array();
	foreach ( array( 'cb', 'gf_cover', 'title', 'gf_featured', 'date' ) as $key ) {
		if ( isset( $columns[ $key ] ) ) {
			$kept[ $key ] = $columns[ $key ];
		}
	}
	return $kept;
}, 9999 );
add_action( 'manage_verk_posts_custom_column', function ( string $column, int $post_id ) {
	if ( 'gf_cover' === $column ) {
		echo get_the_post_thumbnail( $post_id, array( 60, 60 ) ) ?: '—';
	}
	if ( 'gf_featured' === $column ) {
		echo get_post_meta( $post_id, GF_FEATURED_FIELD, true ) ? 'Já' : '—';
	}
}, 10, 2 );

// Profile switch back to the full WordPress admin, for whoever maintains the site.
function gf_profile_field( WP_User $user ): void {
	if ( ! user_can( $user, 'manage_options' ) ) {
		return;
	}
	printf(
		'<h2>Stjórnborð</h2><table class="form-table"><tr><th>Fullt stjórnborð</th><td><label><input type="checkbox" name="gf_full_admin" value="1" %s> Sýna allt WordPress stjórnborðið (fyrir vefstjóra)</label></td></tr></table>',
		checked( (bool) get_user_meta( $user->ID, 'gf_full_admin', true ), true, false )
	);
}
add_action( 'show_user_profile', 'gf_profile_field' );
add_action( 'edit_user_profile', 'gf_profile_field' );

function gf_save_profile_field( int $user_id ): void {
	if ( current_user_can( 'edit_user', $user_id ) && user_can( $user_id, 'manage_options' ) ) {
		update_user_meta( $user_id, 'gf_full_admin', empty( $_POST['gf_full_admin'] ) ? '' : '1' ); // phpcs:ignore WordPress.Security.NonceVerification -- core verifies the profile nonce.
	}
}
add_action( 'personal_options_update', 'gf_save_profile_field' );
add_action( 'edit_user_profile_update', 'gf_save_profile_field' );

/* -------------------------------------------------------------------------
 * 4. Contact form endpoint
 * ---------------------------------------------------------------------- */

/** Origins allowed to post the contact form from a browser. */
function gf_allowed_origins(): array {
	$origins = array_filter( array( gf_frontend_url() ) );
	if ( 'local' === wp_get_environment_type() ) {
		array_push( $origins, 'http://localhost:4321', 'http://127.0.0.1:4321' );
	}
	return $origins;
}

add_filter( 'rest_pre_serve_request', function ( $served, $result, WP_REST_Request $request ) {
	if ( str_starts_with( $request->get_route(), '/' . GF_REST_NS . '/contact' ) ) {
		$origin = get_http_origin();
		header_remove( 'Access-Control-Allow-Origin' );
		header_remove( 'Access-Control-Allow-Credentials' );
		if ( $origin && in_array( $origin, gf_allowed_origins(), true ) ) {
			header( 'Access-Control-Allow-Origin: ' . $origin );
			header( 'Vary: Origin' );
		}
	}
	return $served;
}, 20, 3 );

/** Recipient and subject follow the WPForms notification, so the client keeps one place to change them. */
function gf_contact_settings(): array {
	$form          = json_decode( (string) get_post_field( 'post_content', GF_CONTACT_FORM ), true );
	$notifications = is_array( $form ) ? ( $form['settings']['notifications'] ?? array() ) : array();
	$notification  = is_array( $notifications ) && $notifications ? (array) reset( $notifications ) : array();
	$to           = defined( 'GUNNARSFELL_CONTACT_TO' ) ? GUNNARSFELL_CONTACT_TO : ( $notification['email'] ?? '' );
	$to           = str_replace( '{admin_email}', get_option( 'admin_email' ), $to );
	return array(
		'to'      => array_filter( array_map( 'sanitize_email', explode( ',', $to ) ) ) ?: array( get_option( 'admin_email' ) ),
		'subject' => preg_replace( '/\s*\(ID #\d+\)/', '', $notification['subject'] ?? '' ) ?: 'Ný fyrirspurn á gunnarsfell.is',
	);
}

/**
 * The visitor's address for rate limiting. Behind a proxy or CDN every request arrives from the
 * proxy, so the header that proxy sets is named in wp-config (GUNNARSFELL_CLIENT_IP_HEADER, e.g.
 * 'HTTP_CF_CONNECTING_IP'). Without the constant no forwarded header is trusted.
 */
function gf_client_ip(): string {
	$header = defined( 'GUNNARSFELL_CLIENT_IP_HEADER' ) ? (string) GUNNARSFELL_CLIENT_IP_HEADER : '';
	$ip     = $header && ! empty( $_SERVER[ $header ] ) ? trim( explode( ',', (string) $_SERVER[ $header ] )[0] ) : '';
	return filter_var( $ip, FILTER_VALIDATE_IP ) ?: (string) ( $_SERVER['REMOTE_ADDR'] ?? '' );
}

function gf_rest_contact( WP_REST_Request $request ) {
	$origin = get_http_origin();
	if ( $origin && ! in_array( $origin, gf_allowed_origins(), true ) ) {
		return new WP_Error( 'gf_origin', 'Óheimil beiðni.', array( 'status' => 403 ) );
	}

	$one_line = static fn( $key, $max ) => mb_substr( sanitize_text_field( (string) $request->get_param( $key ) ), 0, $max );
	$fields   = array(
		'Nafn'      => $one_line( 'nafn', 100 ),
		'Símanúmer' => $one_line( 'simi', 30 ),
		'Netfang'   => sanitize_email( (string) $request->get_param( 'netfang' ) ),
		'Þjónusta'  => $one_line( 'thjonusta', 150 ),
		'Skilaboð'  => mb_substr( sanitize_textarea_field( (string) $request->get_param( 'skilabod' ) ), 0, 5000 ),
	);

	// Bots: filled the hidden field, or submitted faster than a person can type. Answer as if it worked.
	// No timing at all means the form was posted without its script; that is a person, not a bot.
	$time   = $request->get_param( 'timi' );
	$is_bot = '' !== (string) $request->get_param( 'vefsida' ) || ( null !== $time && (int) $time < GF_MIN_FILL_MS );
	if ( $is_bot ) {
		return array( 'ok' => true );
	}

	$quick  = 'quick' === $request->get_param( 'form' ); // Name and phone only.
	$errors = array();
	if ( '' === $fields['Nafn'] ) {
		$errors['nafn'] = 'Vinsamlegast sláðu inn nafn.';
	}
	if ( ! is_email( $fields['Netfang'] ) && ! ( $quick && '' !== $fields['Símanúmer'] ) ) {
		$errors['netfang'] = 'Vinsamlegast sláðu inn gilt netfang.';
	}
	if ( '' === $fields['Skilaboð'] && ! $quick ) {
		$errors['skilabod'] = 'Vinsamlegast skrifaðu skilaboð.';
	}
	if ( $quick && '' === $fields['Símanúmer'] ) {
		$errors['simi'] = 'Vinsamlegast sláðu inn símanúmer.';
	}
	if ( $errors ) {
		return new WP_Error( 'gf_invalid', 'Það vantar upplýsingar.', array( 'status' => 422, 'fields' => $errors ) );
	}

	$key  = 'gf_contact_' . md5( gf_client_ip() );
	$sent = (int) get_transient( $key );
	if ( $sent >= GF_RATE_LIMIT ) {
		return new WP_Error( 'gf_rate', 'Of margar sendingar. Reyndu aftur síðar eða hringdu í okkur.', array( 'status' => 429 ) );
	}
	set_transient( $key, $sent + 1, HOUR_IN_SECONDS );

	$lines = array();
	foreach ( array_filter( $fields ) as $label => $value ) {
		$lines[] = $label . ': ' . $value;
	}
	$settings = gf_contact_settings();
	// Address only: a visitor-typed name has no place in a mail header.
	$headers  = is_email( $fields['Netfang'] ) ? array( 'Reply-To: ' . $fields['Netfang'] ) : array();
	$ok       = wp_mail( $settings['to'], $settings['subject'], implode( "\n\n", $lines ), $headers );

	if ( ! $ok ) {
		// The visitor is told; this line is how the site owner finds out. No visitor data in the log.
		error_log( 'gunnarsfell: contact mail failed to send (to: ' . implode( ', ', $settings['to'] ) . ')' ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions
	}

	return $ok
		? array( 'ok' => true )
		: new WP_Error( 'gf_mail', 'Ekki tókst að senda. Reyndu aftur eða hringdu í okkur.', array( 'status' => 502 ) );
}

/* -------------------------------------------------------------------------
 * 5. Rebuild the static site when content changes
 * ---------------------------------------------------------------------- */

function gf_trigger_rebuild(): void {
	if ( ! defined( 'GUNNARSFELL_DEPLOY_HOOK' ) || ! GUNNARSFELL_DEPLOY_HOOK || get_transient( 'gf_rebuild_lock' ) ) {
		return;
	}
	set_transient( 'gf_rebuild_lock', 1, 30 ); // One save fires several hooks; build once.
	$sent = wp_remote_post( GUNNARSFELL_DEPLOY_HOOK, array( 'blocking' => false, 'timeout' => 5 ) );
	if ( is_wp_error( $sent ) ) {
		error_log( 'gunnarsfell: deploy hook call failed: ' . $sent->get_error_message() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions
	}
}

add_action( 'transition_post_status', function ( string $new, string $old, WP_Post $post ) {
	$is_content = in_array( $post->post_type, array_merge( GF_CONTENT_TYPES, array( 'page' ) ), true );
	if ( $is_content && ( 'publish' === $new || 'publish' === $old ) ) {
		// After ACF has stored the gallery and the cover is set.
		add_action( 'shutdown', 'gf_trigger_rebuild' );
	}
}, 10, 3 );

add_filter( 'post_updated_messages', function ( array $messages ) {
	if ( defined( 'GUNNARSFELL_DEPLOY_HOOK' ) && GUNNARSFELL_DEPLOY_HOOK ) {
		foreach ( GF_CONTENT_TYPES as $type ) {
			foreach ( array( 1, 6 ) as $code ) {
				if ( isset( $messages[ $type ][ $code ] ) ) {
					$messages[ $type ][ $code ] .= ' Vefurinn uppfærist eftir 1–2 mínútur.';
				}
			}
		}
	}
	return $messages;
}, 20 );

/* -------------------------------------------------------------------------
 * 6. WordPress's own front end steps aside once the static site is live
 * ---------------------------------------------------------------------- */

add_action( 'template_redirect', function () {
	if ( gf_frontend_url() && ! is_preview() ) {
		wp_redirect( gf_frontend_url() . ( $_SERVER['REQUEST_URI'] ?? '/' ), 301 ); // phpcs:ignore WordPress.Security.SafeRedirect -- fixed host from wp-config.
		exit;
	}
} );

// "View" links in the admin point at the public site.
add_filter( 'post_type_link', 'gf_public_link' );
add_filter( 'page_link', 'gf_public_link' );
function gf_public_link( string $url ): string {
	return gf_frontend_url() && is_admin() ? str_replace( untrailingslashit( home_url() ), gf_frontend_url(), $url ) : $url;
}
